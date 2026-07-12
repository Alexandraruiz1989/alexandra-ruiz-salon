import { NextResponse } from "next/server";
import { getPushPublicKey, isPushConfigured } from "../../../lib/pushServer";

export async function GET() {
  return NextResponse.json({
    success: true,
    publicKey: getPushPublicKey(),
    configured: isPushConfigured(),
  });
}
