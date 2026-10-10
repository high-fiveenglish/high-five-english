// Is the recording intake (upload -> AssemblyAI) fully configured in this environment? Only booleans and the webhook URL leave this module;
// no value of a secret is ever returned or logged.
import { isRecordingStorageConfigured } from "./recordingR2";
import { selectRecordingSite } from "./recordingTarget";

/** The public URL AssemblyAI posts the result to — the same site the background trigger uses. recordingTarget.ts decides which site
 * (with the same environment guard as the trigger); in the default observe mode that is still URL ?? DEPLOY_URL, exactly as before. */
export function recordingWebhookUrl(env: Record<string, string | undefined> = process.env): string | null {
  const siteUrl = selectRecordingSite(env)?.trim();
  if (!siteUrl || !/^https:\/\//.test(siteUrl)) return null;
  return `${siteUrl.replace(/\/$/, "")}/api/public/assemblyai-webhook`;
}

/** Everything the upload needs: the private bucket, the AssemblyAI key, the webhook secret and a webhook URL. When any is missing the upload
 * button stays disabled (the page asks this) and the Server Actions refuse — nothing is created half-way. */
export function isRecordingIntakeAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return isRecordingStorageConfigured(env) && !!env.ASSEMBLYAI_API_KEY?.trim() && !!env.ASSEMBLYAI_WEBHOOK_SECRET?.trim() && recordingWebhookUrl(env) !== null;
}
