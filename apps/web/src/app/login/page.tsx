"use client";

import { Card, CardContent } from "@balance-point/ui/components/card";
import { useState } from "react";

import { Logo } from "@/assets/logo";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(true);

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo className="size-12 text-primary" aria-hidden />
          <span className="text-lg font-semibold">Balance Point</span>
        </div>
        <Card>
          <CardContent>
            {showSignIn ? (
              <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
            ) : (
              <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
