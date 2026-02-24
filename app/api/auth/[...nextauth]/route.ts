import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";

const handler = NextAuth({
  providers: [
    Cognito({
      clientId: process.env.COGNITO_APP_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.idToken = token.idToken;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
