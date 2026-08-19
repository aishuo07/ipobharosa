"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

/**
 * PostHog web analytics. Uses memory persistence only (no cookies, no
 * localStorage) so the product stays privacy-friendly: every page load is
 * counted but nothing is stored on the visitor's device between visits.
 */
export function PostHogProvider() {
  useEffect(() => {
    if (!key || !host) return;
    posthog.init(key, {
      api_host: host,
      persistence: "memory",
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
    });
  }, []);

  return null;
}