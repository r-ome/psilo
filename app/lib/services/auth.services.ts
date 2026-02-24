import {
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";
import { userPool } from "../cognito";
import { SignUpInput, ConfirmForgotPasswordInput } from "../schemas/auth";

export const authService = {
  login: (email: string, password: string) => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });
      user.authenticateUser(authDetails, {
        onSuccess: (result) =>
          resolve({
            accessToken: result.getAccessToken().getJwtToken(),
            idToken: result.getIdToken().getJwtToken(),
            refreshToken: result.getRefreshToken().getToken(),
          }),
        onFailure: (err) => reject(err),
      });
    });
  },
  signup: (data: SignUpInput) => {
    return new Promise((resolve, reject) => {
      const attributes = [
        new CognitoUserAttribute({
          Name: "given_name",
          Value: data.given_name,
        }),
        new CognitoUserAttribute({
          Name: "family_name",
          Value: data.family_name,
        }),
        new CognitoUserAttribute({ Name: "phone", Value: data.phone_number }),
        new CognitoUserAttribute({ Name: "email", Value: data.email }),
      ];

      userPool.signUp(
        data.email,
        data.password,
        attributes,
        attributes,
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        },
      );
    });
  },
  confirmSignUp: (email: string, code: string) => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: email, Pool: userPool });
      user.confirmRegistration(code, true, (err, result) => {
        if (err) reject(err);
        resolve(result);
      });
    });
  },
  logout: () => {
    const user = userPool.getCurrentUser();
    if (user) user.signOut();
  },
  forgotPassword: (email: string) => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: email, Pool: userPool });
      user.forgotPassword({
        onSuccess: (result) => resolve(result),
        onFailure: (error) => reject(error),
      });
    });
  },
  confirmForgotPassword: (data: ConfirmForgotPasswordInput) => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: data.email, Pool: userPool });
      user.confirmPassword(data.code, data.password, {
        onSuccess: (success) => resolve(success),
        onFailure: (error) => reject(error),
      });
    });
  },
};
