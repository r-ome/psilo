export const SIGNUP_STEPS = {
  SIGNUP: "signup",
  CONFIRM: "confirm",
} as const;

export type SignUpStep = (typeof SIGNUP_STEPS)[keyof typeof SIGNUP_STEPS];

export const FORGOT_PASSWORD_STEPS = {
  FORGOT_PASSWORD: "forgot_password",
  CONFIRM: "confirm",
  NEW_PASSWORD: "new_password",
} as const;

export type ForgotPasswordStep =
  (typeof FORGOT_PASSWORD_STEPS)[keyof typeof FORGOT_PASSWORD_STEPS];
