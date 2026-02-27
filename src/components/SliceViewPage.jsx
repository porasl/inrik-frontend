import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';

const APPLICATION_IP = "192.168.4.63";
const PUBLIC_BASE = `http://${APPLICATION_IP}:3000`;
const API_BASE = "";

function toPublicUrl(fsPath) {
    if (!fsPath) return "";
    if (/^https?:\/\//i.test(fsPath)) return fsPath;
    const norm = String(fsPath).replace(/\\/g, "/");
    const idx = norm.indexOf("/videos/");
    const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
    return `${PUBLIC_BASE}${rel}`;
}

function getHlsUrl(post) {
    const hls0 = post.hlsVideoUrls?.[0] || "";
    return hls0 ? (`${PUBLIC_BASE}/` + hls0.split("webdata/")[1]) : (post.hlsUrl || "");
}

function getThumb(post) {
    return toPublicUrl(post.videoImagePath || post.imageUrls?.[0] || "") || post.thumbnailUrl || "";
}

/* ─── Single slice video item ─── */
function SliceItem({ post, isActive, slicePosts }) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const hlsUrl = getHlsUrl(post);
    const thumb = getThumb(post);

    const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
    const [likeCount, setLikeCount] = useState(post.likes || 0);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState('');

    const ownerName = post.user?.name || post.userFirstName
        ? [post.userFirstName, post.userLastName].filter(Boolean).join(" ")
        : post.author || post.email || "User";

    /* ── Start/stop playing when active ── */
    useEffect(() => {
        if (!videoRef.current || !hlsUrl) return;

        if (isActive) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hls.loadSource(hlsUrl);
                hls.attachMedia(videoRef.current);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoRef.current?.play().catch(() => { });
                });
                hlsRef.current = hls;
            } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                videoRef.current.src = hlsUrl;
                videoRef.current.play().catch(() => { });
            }
        } else {
            videoRef.current.pause();
            hlsRef.current?.destroy();
            hlsRef.current = null;
            videoRef.current.src = "";
        }

        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
        };
    }, [isActive, hlsUrl]);

    const toggleLike = async () => {
        const token = localStorage.getItem("token");
        if (!token) { alert("Please log in to like."); return; }
        const newLiked = !liked;
        setLiked(newLiked);
        setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
        try {
            await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `mutation { ${newLiked ? 'likePost' : 'unlikePost'}(postId: "${post.id}") }`
                })
            });
        } catch {
            setLiked(!newLiked);
            setLikeCount(likeCount);
        }
    };

    const loadComments = async () => {
        const token = localStorage.getItem("token");
        if (!token || comments.length > 0) return;
        try {
            const res = await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `query { getComments(postId: "${post.id}") { id text userEmail createdAt } }`
                })
            });
            const json = await res.json();
            setComments(json?.data?.getComments || []);
        } catch { }
    };

    const handleCommentToggle = () => {
        if (!showComments) loadComments();
        setShowComments(v => !v);
    };

    const submitComment = async (e) => {
        e.preventDefault();
        if (!commentText.trim()) return;
        const token = localStorage.getItem("token");
        if (!token) { alert("Please log in to comment."); return; }
        try {
            const res = await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `mutation { addComment(postId: "${post.id}", text: "${commentText.trim().replace(/"/g, '\\"')}") { id text userEmail } }`
                })
            });
            const json = await res.json();
            const c = json?.data?.addComment;
            if (c) setComments(prev => [...prev, c]);
        } catch { }
        setCommentText('');
    };

    return (
        <div className="slice-view-item">
            {/* ── VIDEO ── */}
            <div className="slice-view-video-wrap" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
                {hlsUrl ? (
                    <video
                        ref={videoRef}
                        className="slice-view-video"
                        playsInline
                        loop
                        muted={false}
                        crossOrigin="anonymous"
                        poster={thumb}
                    />
                ) : (
                    <img src={thumb} className="slice-view-video" alt={post.title} style={{ objectFit: 'cover' }} />
                )}

                {/* Overlay: title + owner */}
                <div className="slice-view-overlay">
                    <div className="slice-view-owner">
                        <i className="bi bi-person-circle me-1"></i>
                        <span className="fw-semibold">{ownerName}</span>
                    </div>
                    <div className="slice-view-title">{post.title || "Untitled"}</div>
                </div>
            </div>

            {/* ── SIDE ACTIONS ── */}
            <div className="slice-view-actions">
                {/* Like */}
                <button className={`slice-action-btn ${liked ? 'active' : ''}`} onClick={toggleLike} title="Like">
                    <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                    <span>{likeCount}</span>
                </button>

                {/* Comments */}
                <button className={`slice-action-btn ${showComments ? 'active' : ''}`} onClick={handleCommentToggle} title="Comments">
                    <i className="bi bi-chat-dots"></i>
                    <span>{comments.length || ""}</span>
                </button>

                {/* Share */}
                <button
                    className="slice-action-btn"
                    title="Share"
                    onClick={() => {
                        const url = `${window.location.origin}/watch/${post.id}`;
                        navigator.clipboard?.writeText(url).then(() => alert("Link copied!")).catch(() => alert(url));
                    }}
                >
                    <i className="bi bi-share"></i>
                    <span>Share</span>
                </button>

                {/* Views */}
                <div className="slice-action-btn" style={{ cursor: 'default' }}>
                    <i className="bi bi-eye"></i>
                    <span>{post.views || 0}</span>
                </div>
            </div>

            {/* ── COMMENTS DRAWER ── */}
            {showComments && (
                <div className="slice-comments-drawer" onClick={e => e.stopPropagation()}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="m-0 fw-bold">Comments</h6>
                        <button className="btn-close btn-sm" onClick={() => setShowComments(false)} />
                    </div>
                    <div className="slice-comments-list">
                        {comments.length === 0
                            ? <p className="text-muted small text-center py-4">No comments yet</p>
                            : comments.map(c => (
                                <div key={c.id} className="mb-3">
                                    <div className="fw-semibold" style={{ fontSize: 12 }}>{c.userEmail}</div>
                                    <div style={{ fontSize: 14 }}>{c.text}</div>
                                </div>
                            ))
                        }
                    </div>
                    <form className="mt-auto d-flex gap-2" onSubmit={submitComment}>
                        <input
                            className="form-control form-control-sm"
                            placeholder="Add a comment…"
                            value={commentText}
                            onChange={e => setCommentText(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary btn-sm">Post</button>
                    </form>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════
   SLICE VIEW PAGE  (TikTok / YT Shorts)
   - Full-height vertical scroll
   - Each item = one slice video
   - Starts at the tapped video, loads all slice posts
═══════════════════════════════════════ */
export default function SliceViewPage({ startPost, allSlicePosts, onHome }) {
    const containerRef = useRef(null);
    const [activeIdx, setActiveIdx] = useState(0);

    /* Put startPost first, then everything else */
    const posts = [
        startPost,
        ...allSlicePosts.filter(p => p.id !== startPost.id)
    ];

    /* IntersectionObserver: whichever item is ≥60% visible = active */
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const items = container.querySelectorAll('.slice-view-item');
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    const idx = Number(entry.target.dataset.idx);
                    setActiveIdx(idx);
                }
            });
        }, { threshold: 0.6, root: container });

        items.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, [posts.length]);

    return (
        <div className="slice-view-page">
            {/* Back to home */}
            <button className="slice-view-back" onClick={onHome} title="Back to Home">
                <i className="bi bi-arrow-left"></i>
            </button>

            {/* Vertical scroll container */}
            <div className="slice-view-container" ref={containerRef}>
                {posts.map((post, idx) => (
                    <div key={post.id} data-idx={idx} className="slice-view-item-wrapper">
                        <SliceItem
                            post={post}
                            isActive={idx === activeIdx}
                            slicePosts={posts}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
