import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    architecture: "client-orchestrator + api-gateway",
  });
}
