"use client";

import { Card, CardContent } from "@balance-point/ui/components/card";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(true);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="size-3 rounded-full bg-primary" aria-hidden />
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
