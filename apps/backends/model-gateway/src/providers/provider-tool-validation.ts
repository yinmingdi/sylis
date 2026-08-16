import { canonicalJson } from "@sylis/utils";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import {
  ProviderError,
  ProviderErrorCode,
  type ProviderToolCall,
  type StreamingGenerationRequest,
} from "./contracts";

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();

export function validateProviderToolCall(
  request: StreamingGenerationRequest,
  call: ProviderToolCall,
): ProviderToolCall {
  const tool = request.tools.find(
    ({ providerName }) => providerName === call.providerName,
  );
  if (!tool) {
    throw new ProviderError(
      ProviderErrorCode.TOOL_NOT_ALLOWED,
      "Provider requested a tool that was not included in this invocation.",
      false,
    );
  }
  const key = canonicalJson(tool.inputSchema);
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile(tool.inputSchema);
    validators.set(key, validate);
  }
  if (!validate(call.input)) {
    throw new ProviderError(
      ProviderErrorCode.INVALID_TOOL_ARGUMENTS,
      "Provider tool arguments did not match the released input schema.",
      false,
    );
  }
  return call;
}
