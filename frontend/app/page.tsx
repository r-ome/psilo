"use client"

import Link from "next/link"
import { useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Check, Cloud, Lock, Zap, Archive, ArrowRight, Shield, Clock, Sun, Moon } from "lucide-react"

const pricingPlans = [
  {
    name: "Basic",
    monthlyPrice: "$2.49",
    annualPrice: "$27.39",
    annualEffective: "$2.28",
    period: "/month",
    annualSavings: "Save $2.49",
    description: "For casual users getting started.",
    storage: "200 GB",
    features: [
      "200 GB storage",
      "Photo & video archiving",
      "Web access",
      "Email support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Standard",
    monthlyPrice: "$7.49",
    annualPrice: "$82.39",
    annualEffective: "$6.87",
    period: "/month",
    annualSavings: "Save $7.49",
    description: "For photographers and regular users.",
    storage: "1 TB",
    features: [
      "1 TB storage",
      "Photo & video archiving",
      "Advanced albums & organization",
      "Glacier archive access",
      "Priority support",
      "Batch restore requests",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Premium",
    monthlyPrice: "$13.49",
    annualPrice: "$148.39",
    annualEffective: "$12.37",
    period: "/month",
    annualSavings: "Save $13.49",
    description: "For heavy users and power archivists.",
    storage: "2 TB",
    features: [
      "2 TB storage",
      "Photo & video archiving",
      "Advanced albums & organization",
      "Glacier archive access",
      "Priority support",
      "Batch restore requests",
      "High-resolution 2048px previews",
      "Early access to new features",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
]

const features = [
  {
    icon: Zap,
    title: "Standard Storage",
    description: "Instant access to your most recent photos and videos. Perfect for everyday memories you want to relive anytime.",
  },
  {
    icon: Archive,
    title: "Glacier Archive",
    description: "Long-term cold storage at a fraction of the cost. Ideal for preserving decades of memories safely and affordably.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your files are stored privately in your own S3 bucket. No ad targeting, no data mining — your memories stay yours.",
  },
  {
    icon: Clock,
    title: "Smart Restore",
    description: "Request restores from Glacier with flexible retrieval options. Track progress in real-time from your dashboard.",
  },
]

export default function HomePage() {
  const [annual, setAnnual] = useState(false)
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Cloud className="size-6 text-primary" />
            <span className="text-lg font-semibold">Psilo</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Sign up free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-24 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-6">
            Glacier archive storage — cheaper than Google One
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Your memories, preserved forever
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            Psilo combines instant-access photo storage with cost-effective cold archiving.
            Store a lifetime of photos and videos — starting at $2.49/month.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="gap-2" asChild>
              <Link href="/sign-up">
                Start for Free <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
      </section>

      {/* Competitive positioning banner */}
      <section className="border-y border-border bg-secondary/30 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="mb-8 text-center text-sm text-muted-foreground">
            Undercuts or matches competitors on every tier
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm">
            <div className="text-center">
              <p className="font-semibold">Psilo 200 GB</p>
              <p className="text-primary font-bold">$2.49/mo</p>
              <p className="text-xs text-muted-foreground">vs Google $2.99 (-17%)</p>
            </div>
            <div className="text-center">
              <p className="font-semibold">Psilo 1 TB</p>
              <p className="text-primary font-bold">$7.49/mo</p>
              <p className="text-xs text-muted-foreground">No Google/iCloud 1 TB</p>
            </div>
            <div className="text-center">
              <p className="font-semibold">Psilo 2 TB</p>
              <p className="text-primary font-bold">$13.49/mo</p>
              <p className="text-xs text-muted-foreground">vs Google $13.99 (-3.5%)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Built for serious archiving
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Two storage tiers designed to balance cost, accessibility, and long-term preservation.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border bg-card">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-border bg-secondary/20 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 text-center">
            <Badge variant="secondary" className="mb-4">
              Simple, transparent pricing
            </Badge>
          </div>
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Plans and Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            Privacy-first photo archiving. No free tier — every plan is priced to be the cheapest option on the market.
          </p>

          {/* Billing toggle */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <span className={`text-sm ${!annual ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                annual ? "bg-primary" : "bg-muted"
              }`}
              aria-label="Toggle annual billing"
            >
              <span
                className={`inline-block size-4 rounded-full bg-background transition-transform ${
                  annual ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-sm ${annual ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              Annual
              <Badge variant="secondary" className="ml-2 text-xs">1 month free</Badge>
            </span>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col ${
                  plan.highlighted
                    ? "border-primary bg-card shadow-lg shadow-primary/5"
                    : "border-border bg-card"
                }`}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      {annual ? plan.annualEffective : plan.monthlyPrice}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-muted-foreground">
                      Billed {plan.annualPrice}/year · {plan.annualSavings}
                    </p>
                  )}
                  <CardDescription className="pt-2">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="pt-4">
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/sign-up">{plan.cta}</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <Lock className="mx-auto mb-6 size-12 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Start preserving your memories today
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Privacy-first photo archiving powered by AWS. Your files, your bucket, no lock-in.
          </p>
          <Button size="lg" className="mt-8 gap-2" asChild>
            <Link href="/sign-up">
              Get Started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <Cloud className="size-5 text-primary" />
            <span className="font-semibold">Psilo</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link href="#" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link href="#" className="transition-colors hover:text-foreground">Terms</Link>
            <Link href="#" className="transition-colors hover:text-foreground">Security</Link>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; 2026 Psilo. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
