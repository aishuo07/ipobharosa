import { prisma } from "@/lib/prisma";

/**
 * Thin wrapper around the Expo push service. The mobile app registers an
 * Expo push token (via expo-notifications) with POST /api/push/register,
 * and the server sends broadcast notifications through this module using
 * the Expo HTTP API — no SDK needed server-side.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushResult = {
  accepted: number;
  failed: number;
  invalidTokens: string[];
};

export async function sendPushToTokens(tokens: string[], message: PushMessage): Promise<PushResult> {
  if (tokens.length === 0) return { accepted: 0, failed: 0, invalidTokens: [] };

  // Expo accepts batches of up to 100 tokens per request.
  const result: PushResult = { accepted: 0, failed: 0, invalidTokens: [] };
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const payload = chunk.map((token) => ({
      to: token,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: "default",
      priority: "high",
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      result.failed += chunk.length;
      continue;
    }

    const json = (await response.json()) as { data?: { status?: string; details?: { error?: string } }[] };
    const items = json.data ?? [];
    for (let j = 0; j < items.length; j++) {
      const status = items[j]?.status;
      if (status === "ok") {
        result.accepted++;
      } else {
        result.failed++;
        if (items[j]?.details?.error === "DeviceNotRegistered") {
          result.invalidTokens.push(chunk[j]);
        }
      }
    }
  }

  return result;
}

/**
 * Sends a message to every registered (non-disabled) device. Invalid
 * (unregistered) tokens are marked disabled so later broadcasts skip them.
 */
export async function sendPushBroadcast(message: PushMessage): Promise<PushResult> {
  const devices = await prisma.pushDevice.findMany({
    where: { disabled: false },
    select: { token: true },
  });
  const tokens = devices.map((device) => device.token);
  const result = await sendPushToTokens(tokens, message);

  if (result.invalidTokens.length > 0) {
    await prisma.pushDevice.updateMany({
      where: { token: { in: result.invalidTokens } },
      data: { disabled: true },
    });
  }

  return result;
}