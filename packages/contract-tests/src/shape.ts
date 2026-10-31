import {
  type DocumentNode,
  type GraphQLObjectType,
  type GraphQLOutputType,
  type GraphQLSchema,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  Kind,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from "graphql";

const scalarOk = (name: string, value: unknown): boolean => {
  if (name === "Int" || name === "Float") return typeof value === "number";
  if (name === "Boolean") return typeof value === "boolean";
  if (name === "String" || name === "ID") return typeof value === "string";
  return true;
};

/**
 * What's wrong with `data` as the answer to `document`: every selected field (by its alias) must
 * be there, with the schema's type, and non-null where the schema says so. This is what a strict
 * client's decoder needs from a real gateway.
 */
export const shapeProblems = (
  schema: GraphQLSchema,
  document: DocumentNode,
  data: Record<string, unknown>,
): string[] => {
  const problems: string[] = [];

  const value = (type: GraphQLOutputType, got: unknown, at: string, set?: SelectionSetNode) => {
    if (isNonNullType(type)) {
      if (got === null || got === undefined) problems.push(`${at}: null for ${String(type)}`);
      else value(type.ofType as GraphQLOutputType, got, at, set);
      return;
    }
    if (got === null) return;
    if (isListType(type)) {
      if (Array.isArray(got)) {
        for (const [index, item] of got.entries()) value(type.ofType, item, `${at}[${index}]`, set);
      } else {
        problems.push(`${at}: not a list`);
      }
      return;
    }
    if (isObjectType(type) && set) object(type, got as Record<string, unknown>, set, at);
    else if (isEnumType(type)) {
      if (!type.getValues().some((v) => v.name === got))
        problems.push(`${at}: bad enum ${String(got)}`);
    } else if (!scalarOk(type.name, got)) problems.push(`${at}: not ${type.name}: ${String(got)}`);
  };

  const object = (
    type: GraphQLObjectType,
    got: Record<string, unknown>,
    set: SelectionSetNode,
    at: string,
  ) => {
    for (const selection of set.selections) {
      if (selection.kind !== Kind.FIELD) continue;
      const key = selection.alias?.value ?? selection.name.value;
      const path = at ? `${at}.${key}` : key;
      const field = type.getFields()[selection.name.value];
      if (!field) problems.push(`${path}: not in the schema`);
      else if (key in got) {
        value(field.type, got[key], path, selection.selectionSet);
      } else {
        problems.push(`${path}: missing`);
      }
    }
  };

  const operation = document.definitions[0] as OperationDefinitionNode;
  const root =
    operation.operation === "mutation" ? schema.getMutationType() : schema.getQueryType();
  if (root) object(root, data, operation.selectionSet, "");
  return problems;
};
