import { NextResponse } from "next/server";
import { getAppleAppSiteAssociation } from "@/lib/appleAppSiteAssociation";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getAppleAppSiteAssociation());
}