import type { Metadata } from "next";
import LandingClient from "@/components/landing/LandingClient";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

export default function Page() {
  return <LandingClient />;
}
