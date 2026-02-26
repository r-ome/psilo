import { z } from "zod";

export const loginSchema = z.object({
  email: z.string("Email is required").email("Must be a valid email address"),
  password: z
    .string("Password is required")
    .min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    given_name: z
      .string("First Name is required")
      .min(2, "First Name must be at least 2 characters")
      .max(50, "First Name must be at least 50 characters"),
    family_name: z
      .string("Last Name is required")
      .min(2, "Last Name must be at least 2 characters")
      .max(50, "Last Name must be at least 50 characters"),
    phone_number: z
      .string("Phone Number is required")
      .regex(
        /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
        "Invalid phone number format",
      ),
    email: z.string("Email is required").email("Must be a valid email address"),
    password: z
      .string("Password is required")
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirm_password: z.string("Confirm Password is required"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const confirmSignUpSchema = z.object({
  email: z.string("Email is required").email("Must be a valid email address"),
  confirmationCode: z.string("Confirmation Code is required"),
});
export type ConfirmSignUpInput = z.infer<typeof confirmSignUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string("Email is required").email("Must be a valid email address"),
});
export type forgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const confirmForgotPasswordSchema = z.object({
  email: z.string("Email is required").email("Must be a valid email address"),
  confirmationCode: z.string("Confirmation Code is required"),
  password: z
    .string("Password is required")
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});
export type ConfirmForgotPasswordInput = z.infer<
  typeof confirmForgotPasswordSchema
>;
