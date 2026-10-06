// Is the recording intake (upload -> AssemblyAI) fully configured in this environment? Only booleans and the webhook URL leave this module;
// no value of a secret is ever returned or logged.
import { isRecordingStorageConfigured } from "./recordingR2";

/** The public URL AssemblyAI posts the result to — the same site URL the background trigger uses (recordingTrigger.ts). */
export function recordingWebhookUrl(env: Record<string, string | undefined> = process.env): string | null {
  const siteUrl = (env.URL ?? env.DEPLOY_URL)?.trim();
  if (!siteUrl || !/^https:\/\//.test(siteUrl)) return null;
  return `${siteUrl.replace(/\/$/, "")}/api/public/assemblyai-webhook`;
}

/** Everything the upload needs: the private bucket, the AssemblyAI key, the webhook secret and a webhook URL. When any is missing the upload
 * button stays disabled (the page asks this) and the Server Actions refuse — nothing is created half-way. */
export function isRecordingIntakeAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return isRecordingStorageConfigured(env) && !!env.ASSEMBLYAI_API_KEY?.trim() && !!env.ASSEMBLYAI_WEBHOOK_SECRET?.trim() && recordingWebhookUrl(env) !== null;
}
