import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getUserProfileCached } from '../services/userProfileService';

function toPublicUrl(fsPath) {
    if (!fsPath) return "";
    if (/^https?:\/\//i.test(fsPath)) return fsPath;
    const norm = String(fsPath).replace(/\\/g, "/");
    const idx = norm.indexOf("/videos/");
    const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
    return `${PUBLIC_BASE}${rel}`;
}

function isNumericLike(value) {
    return /^\d+$/.test(String(value || '').trim());
}

function getOwnerDisplayName(post) {
    const authorValue = String(post?.author || '').trim();
    const userNameValue = String(post?.user?.name || '').trim();
    return [post?.userFirstName, post?.userLastName].filter(Boolean).join(' ')
        || (!isNumericLike(userNameValue) ? userNameValue : '')
        || (!isNumericLike(authorValue) ? authorValue : '')
        || post?.email
        || 'User';
}

function resolveThumbnailUrl(post) {
    const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
    const candidates = [
        post?.videoImagePath,
        post?.thumbnailUrl,
        ...toArray(post?.imageUrls),
        post?.imageUrl,
    ].filter(Boolean);

    const validImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i;

    for (const candidate of candidates) {
        const raw = String(candidate).trim();
        if (!raw || isNumericLike(raw) || raw.includes('@')) continue;

        const resolved = toPublicUrl(raw);
        if (!resolved) continue;

        const looksLikeImage = validImageExt.test(resolved)
            || resolved.includes('/images/')
            || resolved.includes('/videos/')
            || resolved.includes('/thumbnails/')
            || resolved.startsWith('data:image/');

        if (looksLikeImage) return resolved;
    }

    return '';
}

function resolvePlayableVideoUrl(post) {
    const toArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);
    const candidates = [
        ...toArray(post?.hlsVideoUrls),
        ...toArray(post?.videoUrls),
        post?.hlsUrl,
        post?.videoUrl,
        post?.videoPath,
    ].filter(Boolean);

    const normalize = (value) => {
        const raw = String(value).trim();
        if (!raw) return '';

        if (/^https?:\/\//i.test(raw)) return raw;

        const norm = raw.replace(/\\/g, '/');
        const webdataIdx = norm.indexOf('webdata/');
        if (webdataIdx >= 0) {
            return `${PUBLIC_BASE}/${norm.slice(webdataIdx + 'webdata/'.length)}`;
        }

        const videosIdx = norm.indexOf('/videos/');
        if (videosIdx >= 0) {
            return `${PUBLIC_BASE}${norm.slice(videosIdx)}`;
        }

        if (norm.startsWith('videos/')) {
            return `${PUBLIC_BASE}/${norm}`;
        }

        return '';
    };

    const validExt = /\.(m3u8|mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;
    return candidates
        .map(normalize)
        .find((u) => u && validExt.test(u)) || '';
}

function isHiddenVideoTitle(title) {
    const normalized = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized === 'untitled video' || normalized === 'untilted video';
}

/* ── tiny avatar ── */
const avatarCache = {};

function Avatar({ user = {}, size = 40 }) {
    const authorValue = String(user.author || '').trim();
    const userNameValue = String(user.name || '').trim();
    const userEmail = user.email || (authorValue.includes('@') ? authorValue : '');

    const fallbackName = [user.userFirstName, user.userLastName].filter(Boolean).join(' ')
        || (!isNumericLike(userNameValue) ? userNameValue : '')
        || (!isNumericLike(authorValue) ? authorValue : '')
        || userEmail
        || 'User';

    const [avatarUrl, setAvatarUrl] = useState(() => {
        const raw = user.avatar || user.userProfileImageUrl || null;
        return (raw && !raw.includes('@')) ? toPublicUrl(raw) : null;
    });

    const [resolvedName, setResolvedName] = useState(fallbackName);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!userEmail) return;

        if (avatarCache[userEmail]) {
            setAvatarUrl(avatarCache[userEmail].url);
            setResolvedName(avatarCache[userEmail].name);
            return;
        }

        getUserProfileCached(userEmail)
            .then((profile) => {
                const fetchedName = profile ? [profile.firstname, profile.lastname].filter(Boolean).join(' ') : null;
                const finalName = fetchedName || fallbackName;

                const url = profile?.profileImageUrl;
                if (url) {
                    const fullUrl = toPublicUrl(url);
                    avatarCache[userEmail] = { url: fullUrl, name: finalName };
                    setAvatarUrl(fullUrl);
                    setResolvedName(finalName);
                } else {
                    const local = userEmail.split('@')[0];
                    const attemptUrl = toPublicUrl(`/profileImages/${local}.jpg`);
                    avatarCache[userEmail] = { url: attemptUrl, name: finalName };
                    setAvatarUrl(attemptUrl);
                    setResolvedName(finalName);
                }
            }).catch(() => {
                const local = userEmail.split('@')[0];
                setAvatarUrl(toPublicUrl(`/profileImages/${local}.jpg`));
                setResolvedName(fallbackName);
            });
    }, [userEmail, fallbackName]);

    return (
        <div className="rounded-circle overflow-hidden flex-shrink-0 bg-light d-flex align-items-center justify-content-center"
            style={{ width: size, height: size, border: '1px solid #eee', cursor: 'help' }}
            title={resolvedName}
        >
            {avatarUrl && !hasError ? (
                <img
                    src={avatarUrl}
                    alt={resolvedName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { setHasError(true); e.target.style.display = 'none'; }}
                />
            ) : (
                <i className="bi bi-person-circle text-secondary" style={{ fontSize: size * 0.8, lineHeight: 1 }}></i>
            )}
        </div>
    );
}

/* ── related video row in right sidebar ── */
function RelatedVideoRow({ post, onWatch }) {
    const thumb = resolveThumbnailUrl(post);
    const owner = getOwnerDisplayName(post);
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

    // Sync state when navigating between different videos
    useEffect(() => {
        setLiked(!!post.isLikedByCurrentUser);
        setLikeCount(post.likes || 0);
        setViews(post.views || 0);
    }, [post.id, post.likes, post.isLikedByCurrentUser, post.views]);

    /* Build playable video url */
    const playableVideoUrl = resolvePlayableVideoUrl(post);
    const isHlsVideo = /\.m3u8(\?|$)/i.test(playableVideoUrl);

    const thumbSrc = resolveThumbnailUrl(post);
    const owner = post.user || {};
    const ownerName = owner.name || getOwnerDisplayName(post);

    /* Related videos = everything except the current one */
    const related = allPosts.filter((p) => p.id !== post.id && !!resolvePlayableVideoUrl(p) && !isHiddenVideoTitle(p?.title));

    /* ── Mount / destroy HLS ── */
    useEffect(() => {
        if (!videoRef.current || !playableVideoUrl) return;
        if (isHlsVideo && Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(playableVideoUrl);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current?.play().catch(() => { });
            });
            hlsRef.current = hls;
        } else {
            videoRef.current.src = playableVideoUrl;
            videoRef.current.play().catch(() => { });
        }
        /* Increment view count */
        incrementView();
        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
        };
    }, [post.id, playableVideoUrl, isHlsVideo]);

    const incrementView = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `mutation { incrementPostViews(postId: "${post.id}") { id views } }`
                })
            });
            const json = await res.json();
            const updated = json.data?.incrementPostViews;
            if (updated) {
                setViews(updated.views);
            }
        } catch { }
    };

    const toggleLike = async () => {
        const token = localStorage.getItem("token");
        if (!token) { alert("Please log in to like."); return; }
        const newLiked = !liked;
        setLiked(newLiked);
        setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
        try {
            const res = await fetch(`${API_BASE}/graphql`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    query: `mutation { toggleLike(postId: "${post.id}") { id likes isLikedByCurrentUser } }`
                })
            });
            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);

            const updated = json.data?.toggleLike;
            if (updated) {
                setLikeCount(updated.likes);
                setLiked(updated.isLikedByCurrentUser);
            }
        } catch (err) {
            console.error("Watch page like failed:", err);
            /* revert on failure */
            setLiked(!newLiked);
            setLikeCount(c => newLiked ? c - 1 : c + 1);
        }
    };

    return (
        <div className="video-watch-root">

            {/* ── LEFT: Player + Info + Comments ── */}
            <div className="video-watch-left">

                {/* Video player */}
                <div className="rounded-3 overflow-hidden bg-black w-100 shadow video-watch-player" style={{ aspectRatio: '16/9' }}>
                    {playableVideoUrl ? (
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
                <div className="video-watch-meta d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 pb-3 border-bottom">

                    {/* Owner + views */}
                    <div className="d-flex align-items-center gap-2">
                        <Avatar user={post} size={40} />
                        <div>
                            <div className="fw-semibold" style={{ fontSize: 14 }}>{ownerName}</div>
                            <div className="text-secondary" style={{ fontSize: 12 }}>
                                <i className="bi bi-eye me-1"></i>{views.toLocaleString()} views
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="video-watch-actions d-flex align-items-center gap-2">
                        <button
                            className={`btn btn-sm d-flex align-items-center gap-2 fw-semibold px-3 ${liked ? 'btn-danger' : 'btn-outline-secondary'}`}
                            onClick={toggleLike}
                            style={{ borderRadius: 20 }}
                        >
                            <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                            <span className="d-none d-md-inline">{likeCount.toLocaleString()}</span>
                            <span className="d-md-none">{likeCount}</span>
                        </button>
                        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3" style={{ borderRadius: 20 }}>
                            <i className="bi bi-share"></i> <span className="d-none d-md-inline">Share</span>
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

            {/* ── MOBILE: Horizontal thumbnail carousel at bottom ── */}
            <div className="video-watch-mobile-carousel d-md-none">
                <div className="px-3 mb-2" style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Up Next</div>
                <div className="d-flex gap-2 overflow-x-auto pb-2 px-3" style={{ scrollBehavior: 'smooth' }}>
                    {related.map(p => {
                        const thumb = resolveThumbnailUrl(p);
                        return (
                            <div
                                key={p.id}
                                className="flex-shrink-0 rounded-2 overflow-hidden cursor-pointer"
                                style={{ width: 100, height: 56, backgroundColor: '#e9ecef' }}
                                onClick={() => onWatch(p)}
                            >
                                {thumb ? (
                                    <img
                                        src={thumb}
                                        alt={p.title}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary">
                                        <i className="bi bi-play-circle" style={{ fontSize: '1.2rem' }}></i>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
