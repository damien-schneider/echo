import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { formatElapsed } from "@/features/meeting/format-elapsed";
import type {
  ActivityDecoration,
  ActivityVisualState,
} from "@/features/overlay-controls/recording-overlay-state";
import { listenCancellable } from "@/lib/tauri-listener";
import { type ActiveMeeting, ActiveMeetingSchema } from "@/lib/types";

export interface MeetingNotice {
  actionLabel: string | null;
  decoration: ActivityDecoration;
  isDismissible: boolean;
  key: string;
  text: string;
  visualState: ActivityVisualState;
}

interface MeetingNoticeOptions {
  active: ActiveMeeting | null;
  dismissedKey: string | null;
  now: number;
}

export const meetingNoticeFor = ({
  active,
  dismissedKey,
  now,
}: MeetingNoticeOptions): MeetingNotice | null => {
  if (active === null) {
    return null;
  }
  const key =
    active.state === "recording"
      ? `recording-${active.meeting_id}`
      : "processing";
  if (key === dismissedKey) {
    return null;
  }
  if (active.state === "processing") {
    return {
      actionLabel: null,
      decoration: "progress",
      isDismissible: true,
      key,
      text: "Transcribing the meeting…",
      visualState: "processing",
    };
  }
  return {
    actionLabel: "Stop the meeting",
    decoration: "microphone",
    isDismissible: true,
    key,
    text: formatElapsed(Math.max(0, now - active.start_time * 1000)),
    visualState: "steady",
  };
};

export const useMeetingNotice = () => {
  const [active, setActive] = useState<ActiveMeeting | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    let pushed = false;
    const apply = (payload: unknown) => {
      const parsed = ActiveMeetingSchema.nullable().safeParse(payload);
      if (!stopped && parsed.success) {
        setActive(parsed.data);
      }
    };
    const release = listenCancellable(() =>
      listen<unknown>("meeting-active", (event) => {
        pushed = true;
        apply(event.payload);
      })
    );
    // Only for a window that opened mid-meeting — a push that landed first is the fresher truth.
    invoke<unknown>("get_active_meeting")
      .then((payload) => {
        if (!pushed) {
          apply(payload);
        }
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      release();
    };
  }, []);

  const isRecording = active?.state === "recording";
  useEffect(() => {
    if (!isRecording) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, [isRecording]);

  const notice = meetingNoticeFor({ active, dismissedKey, now });
  return {
    dismiss: () => {
      if (notice) {
        setDismissedKey(notice.key);
      }
    },
    notice,
    stop: () => {
      invoke("stop_meeting").catch(() => undefined);
    },
  };
};
