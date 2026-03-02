import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';

const APPLICATION_IP = "192.168.4.76";
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

/* ── tiny avatar ── */
function Avatar({ user = {}, size = 40 }) {
    const name = user.name || user.email || "User";
    const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#6f42c1', '#fd7e14'];
    const bg = colors[name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length];
    const avatarUrl = user.avatar ? toPublicUrl(user.avatar) : null;
    return (
        <div className="rounded-circle overflow-hidden flex-shrink-0"
            style={{ width: size, height: size, background: bg, border: '2px solid #eee' }}>
            {avatarUrl
                ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                : <div className="w-100 h-100 d-flex align-items-center justify-content-center text-white fw-bold" style={{ fontSize: size * 0.35 }}>{initials}</div>
            }
        </div>
    );
}

/* ── related video row in right sidebar ── */
function RelatedVideoRow({ post, onWatch }) {
    const thumb = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? "")) || post.thumbnailUrl || "";
    const owner = post.user?.name || post.author || "User";
    return (
        <div
            className="d-flex gap-2 p-2 rounded-3 cursor-pointer"
            style={{ cursor: 'pointer' }}
            onClick={() => onWatch(post)}
            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <div className="flex-shrink-0 rounded-2 overflow-hidden bg-dark" style={{ width: 120, height: 68 }}>
                {thumb
                    ? <img src={thumb} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary"><i className="bi bi-play-circle fs-3"></i></div>
                }
            </div>
            <div className="flex-grow-1 overflow-hidden" style={{ minWidth: 0 }}>
                <div className="fw-semibold text-truncate" style={{ fontSize: 13, color: '#2c3e50', lineHeight: 1.3 }}>
                    {post.title || "Untitled"}
                </div>
                <div className="text-secondary" style={{ fontSize: 12 }}>{owner}</div>
                <div className="text-secondary d-flex gap-2 mt-1" style={{ fontSize: 11 }}>
                    <span><i className="bi bi-eye me-1"></i>{post.views || 0}</span>
                    <span><i className="bi bi-heart me-1"></i>{post.likes || 0}</span>
                </div>
            </div>
        </div>
    );
}

/* ── comment input + list ── */
function CommentsSection({ postId }) {
    const [comments, setComments] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!postId) return;
        const token = localStorage.getItem("token");
        if (!token) return;
        setLoading(true);
        fetch(`${API_BASE}/graphql`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
                query: `query { getComments(postId: "${postId}") { id text userEmail createdAt } }`
            })
        })
            .then(r => r.json())
            .then(j => setComments(j?.data?.getComments || []))
            .catch(() => { }) // silently ignore if endpoint not ready
            .finally(() => setLoading(false));
    }, [postId]);

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const token = localStorage.getItem("token");
        if (!token) { alert("Please log in to comment."); return; }
        try {
            const res = await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `mutation { addComment(postId: "${postId}", text: "${text.trim().replace(/"/g, '\\"')}") { id text userEmail createdAt } }`
                })
            });
            const json = await res.json();
            const newComment = json?.data?.addComment;
            if (newComment) setComments(prev => [newComment, ...prev]);
        } catch { }
        setText('');
    };

    const user = { email: localStorage.getItem("email") || "You" };

    return (
        <div className="mt-4">
            <h6 className="fw-bold mb-3" style={{ color: '#2c3e50' }}>
                {comments.length} Comment{comments.length !== 1 ? 's' : ''}
            </h6>

            {/* Add comment */}
            <div className="d-flex gap-3 mb-4">
                <Avatar user={user} size={36} />
                <form className="flex-grow-1 d-flex flex-column gap-2" onSubmit={handleAddComment}>
                    <input
                        className="form-control bg-light border-0 border-bottom rounded-0"
                        style={{ boxShadow: 'none', paddingLeft: 0 }}
                        placeholder="Add a comment…"
                        value={text}
                        onChange={e => setText(e.target.value)}
                    />
                    {text && (
                        <div className="d-flex justify-content-end gap-2">
                            <button type="button" className="btn btn-sm btn-light" onClick={() => setText('')}>Cancel</button>
                            <button type="submit" className="btn btn-sm btn-primary px-3">Comment</button>
                        </div>
                    )}
                </form>
            </div>

            {/* Comment list */}
            {loading && <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-secondary"></div></div>}
            <div className="d-flex flex-column gap-3">
                {comments.map(c => (
                    <div key={c.id} className="d-flex gap-3">
                        <Avatar user={{ email: c.userEmail }} size={36} />
                        <div>
                            <div className="fw-semibold" style={{ fontSize: 13 }}>{c.userEmail}</div>
                            <div style={{ fontSize: 14, color: '#333' }}>{c.text}</div>
                            {c.createdAt && <div className="text-secondary" style={{ fontSize: 11 }}>{new Date(c.createdAt).toLocaleDateString()}</div>}
                        </div>
                    </div>
                ))}
                {!loading && comments.length === 0 && (
                    <p className="text-muted small">No comments yet. Be the first!</p>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════
   MAIN VIDEO WATCH PAGE
═══════════════════════════════════════════ */
export default function VideoWatchPage({ post, allPosts, onWatch, onHome }) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
    const [likeCount, setLikeCount] = useState(post.likes || 0);
    const [views, setViews] = useState(post.views || 0);

    /* Build full HLS url */
    const hls0 = post.hlsVideoUrls?.[0] || "";
    const hlsUrl = hls0 ? (`${PUBLIC_BASE}/` + hls0.split("webdata/")[1]) : (post.hlsUrl || "");

    const thumbSrc = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? "")) || post.thumbnailUrl || "";
    const owner = post.user || {};
    const ownerName = owner.name || post.author || "Unknown";

    /* Related videos = everything except the current one */
    const related = allPosts.filter(p => p.id !== post.id);

    /* ── Mount / destroy HLS ── */
    useEffect(() => {
        if (!videoRef.current || !hlsUrl) return;
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
        /* Increment view count */
        incrementView();
        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
        };
    }, [post.id]);

    const incrementView = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `mutation { incrementPostView(postId: "${post.id}") }`
                })
            });
            setViews(v => v + 1);
        } catch { }
    };

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
            /* revert on failure */
            setLiked(liked);
            setLikeCount(likeCount);
        }
    };

    return (
        <div className="video-watch-root">

            {/* ── LEFT: Player + Info + Comments ── */}
            <div className="video-watch-left">

                {/* Video player */}
                <div className="rounded-3 overflow-hidden bg-black w-100 shadow" style={{ aspectRatio: '16/9' }}>
                    {hlsUrl ? (
                        <video
                            ref={videoRef}
                            controls
                            playsInline
                            crossOrigin="anonymous"
                            className="w-100 h-100"
                            style={{ objectFit: 'contain', background: '#000' }}
                            poster={thumbSrc}
                        />
                    ) : (
                        <img src={thumbSrc} className="w-100 h-100" style={{ objectFit: 'contain' }} alt={post.title} />
                    )}
                </div>

                {/* Title */}
                <h5 className="fw-bold mt-3 mb-1" style={{ color: '#1a1a2e', lineHeight: 1.4 }}>
                    {post.title || "Untitled Video"}
                </h5>

                {/* Meta row */}
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 pb-3 border-bottom">

                    {/* Owner + views */}
                    <div className="d-flex align-items-center gap-2">
                        <Avatar user={owner} size={40} />
                        <div>
                            <div className="fw-semibold" style={{ fontSize: 14 }}>{ownerName}</div>
                            <div className="text-secondary" style={{ fontSize: 12 }}>
                                <i className="bi bi-eye me-1"></i>{views.toLocaleString()} views
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="d-flex align-items-center gap-2">
                        <button
                            className={`btn btn-sm d-flex align-items-center gap-2 fw-semibold px-3 ${liked ? 'btn-danger' : 'btn-outline-secondary'}`}
                            onClick={toggleLike}
                            style={{ borderRadius: 20 }}
                        >
                            <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                            {likeCount.toLocaleString()}
                        </button>
                        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3" style={{ borderRadius: 20 }}>
                            <i className="bi bi-share"></i> Share
                        </button>
                    </div>
                </div>

                {/* Description */}
                {post.description && (
                    <div className="bg-light rounded-3 p-3 mb-3" style={{ fontSize: 14, color: '#444' }}>
                        {post.description}
                    </div>
                )}

                {/* Comments */}
                <CommentsSection postId={post.id} />
            </div>

            {/* ── RIGHT: Related videos sidebar ── */}
            <div className="video-watch-right">
                <h6 className="fw-bold px-2 mb-3" style={{ color: '#2c3e50' }}>Up Next</h6>
                {related.length === 0 && (
                    <p className="text-muted small px-2">No other videos available.</p>
                )}
                <div className="d-flex flex-column gap-1">
                    {related.map(p => (
                        <RelatedVideoRow key={p.id} post={p} onWatch={onWatch} />
                    ))}
                </div>
            </div>
        </div>
    );
}
