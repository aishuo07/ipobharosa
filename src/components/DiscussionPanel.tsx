"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  user: { name: string | null };
  canDelete?: boolean;
};

type Props = {
  ipoId: string;
  user: { id: string | null; email: string | null; name: string | null } | null;
};

export function DiscussionPanel({ ipoId, user }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ipo/${ipoId}/comments`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setComments(data.comments ?? []))
      .catch(() => setError("Could not load the discussion right now."))
      .finally(() => setLoading(false));
  }, [ipoId]);

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/${ipoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not post your comment.");
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post your comment.");
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, ipoId]);

  const remove = useCallback(async (commentId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/ipo/${ipoId}/comments?id=${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the comment.");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the comment.");
    }
  }, [ipoId]);

  return (
    <div className="discussion">
      {error && <p className="discussion-error">{error}</p>}
      {loading ? (
        <p className="discussion-empty">Loading discussion…</p>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="discussion-empty">
              No discussion yet. Be the first to share an observation about this IPO.
            </p>
          ) : (
            <ul className="discussion-list">
              {comments.map((comment) => (
                <li className="discussion-item" key={comment.id}>
                  <div className="discussion-item-head">
                    <span className="discussion-author">
                      {comment.user.name ?? "Anonymous"}
                    </span>
                    <span className="discussion-item-actions">
                      <span className="discussion-time">
                        {new Date(comment.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      {comment.canDelete && (
                        <button
                          type="button"
                          className="discussion-delete"
                          onClick={() => remove(comment.id)}
                          aria-label="Delete your comment"
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="discussion-body">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <form
        className="discussion-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {user ? (
          <>
            <textarea
              className="ui-input discussion-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Share a note about this IPO (market view, question, or heads-up)…"
              aria-label="Your comment"
            />
            <div className="discussion-form-row">
              <span className="discussion-count">{draft.length}/500</span>
              <Button type="submit" variant="primary" disabled={submitting || draft.trim().length === 0}>
                {submitting ? "Posting…" : "Post comment"}
              </Button>
            </div>
          </>
        ) : (
          <p className="discussion-signin">
            <Link href="/login">Sign in</Link> to join the discussion.
          </p>
        )}
      </form>
    </div>
  );
}