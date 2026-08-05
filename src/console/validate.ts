/**
 * Pre-send validation (F3.2) against the generated form specs: required
 * fields present, no unknown fields (request DTOs are deny_unknown_fields
 * upstream — AR-6.2 — so an unknown key WILL be refused; catching it before
 * send is the courtesy), primitive kinds checked, bytes fields canonical
 * base64. Full structural validation of nested `json` fields stays with the
 * owner — this layer never claims more than it checks.
 */
import { COMMANDS, COMMAND_FORMS, type CommandId } from "../generated";

const SCOPE_FIELDS = new Set(["type", "branch", "space", "as_of"]);
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function validatePayload(commandId: CommandId, payload: Record<string, unknown>): string[] {
  const spec = COMMAND_FORMS[commandId];
  const errors: string[] = [];
  const known = new Set(spec.fields.map((f) => f.name));

  for (const name of Object.keys(payload)) {
    if (SCOPE_FIELDS.has(name)) continue; // injected scope is always legal
    if (!known.has(name)) {
      errors.push(`unknown field "${name}" (requests are deny_unknown_fields upstream)`);
    }
  }

  for (const field of spec.fields) {
    const value = payload[field.name];
    if (value === undefined || value === null) {
      if (field.required) errors.push(`missing required field "${field.name}"`);
      continue;
    }
    switch (field.kind) {
      case "string":
        if (typeof value !== "string") errors.push(`"${field.name}" must be a string`);
        break;
      case "number":
        if (typeof value !== "number") errors.push(`"${field.name}" must be a number`);
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`"${field.name}" must be a boolean`);
        break;
      case "bytes":
        if (typeof value !== "string" || !BASE64_RE.test(value)) {
          errors.push(`"${field.name}" must be standard base64 (wire Bytes)`);
        }
        break;
      case "enum":
        if (typeof value !== "string" || !(field.enumValues ?? []).includes(value)) {
          errors.push(`"${field.name}" must be one of: ${(field.enumValues ?? []).join(", ")}`);
        }
        break;
      case "json":
        break; // owner-validated
    }
  }
  return errors;
}

/** Validates a raw wire command object and resolves its command id. */
export function validateRawCommand(raw: unknown): { commandId: CommandId; errors: string[] } | { commandId: null; errors: string[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { commandId: null, errors: ["a wire command is a JSON object with a \"type\" tag"] };
  }
  const command = raw as Record<string, unknown>;
  const wireType = command.type;
  if (typeof wireType !== "string") {
    return { commandId: null, errors: ['missing "type": the wire discriminator (AR-1.6)'] };
  }
  const commandId = (Object.keys(COMMANDS) as CommandId[]).find(
    (id) => COMMANDS[id].wireType === wireType,
  );
  if (!commandId) {
    return { commandId: null, errors: [`unknown wire type "${wireType}" in the vendored catalog`] };
  }
  const { type: _tag, ...payload } = command;
  return { commandId, errors: validatePayload(commandId, payload) };
}
