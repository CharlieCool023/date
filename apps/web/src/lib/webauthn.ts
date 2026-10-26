import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/server";
import {
  authenticationResponseSchema,
  registrationResponseSchema
} from "@velum/contracts";

export function webAuthnConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID;
  const rpName = process.env.WEBAUTHN_RP_NAME;
  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!rpID || !rpName || !origin) throw new Error("WebAuthn configuration is incomplete");
  return { rpID, rpName, origin };
}

export function parseRegistrationResponse(value: unknown): RegistrationResponseJSON {
  const parsed = registrationResponseSchema.parse(value);
  const attachment = parsed.authenticatorAttachment;
  return {
    id: parsed.id,
    rawId: parsed.rawId,
    type: "public-key",
    response: {
      attestationObject: parsed.response.attestationObject,
      clientDataJSON: parsed.response.clientDataJSON,
      ...(parsed.response.transports
        ? { transports: parsed.response.transports }
        : {})
    },
    clientExtensionResults: {},
    ...(attachment === "platform" || attachment === "cross-platform" ? { authenticatorAttachment: attachment } : {})
  };
}

export function parseAuthenticationResponse(value: unknown): AuthenticationResponseJSON {
  const parsed = authenticationResponseSchema.parse(value);
  const attachment = parsed.authenticatorAttachment;
  return {
    id: parsed.id,
    rawId: parsed.rawId,
    type: "public-key",
    response: {
      authenticatorData: parsed.response.authenticatorData,
      clientDataJSON: parsed.response.clientDataJSON,
      signature: parsed.response.signature,
      ...(parsed.response.userHandle ? { userHandle: parsed.response.userHandle } : {})
    },
    clientExtensionResults: {},
    ...(attachment === "platform" || attachment === "cross-platform" ? { authenticatorAttachment: attachment } : {})
  };
}
