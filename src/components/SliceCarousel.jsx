import React, { useState, useEffect, useRef } from 'react';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getSlicePostsCached, subscribePostsCacheUpdates, subscribePostsRefreshStatus } from '../services/postsService';
import { getUserProfileCached } from '../services/userProfileService';
import useDelayedVisibility from '../hooks/useDelayedVisibility';

function toPublicUrl(fsPath) {
    if (!fsPath) return "";
    if (/^https?:\/\//i.test(fsPath)) return fsPath;
    const norm = String(fsPath).replace(/\\/g, "/");
    const idx = norm.indexOf("/videos/");
    const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
    return `${PUBLIC_BASE}${rel}`;
}

function decodeJwtPayload(token) {
    if (!token) return null;
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

function getCurrentViewer() {
    const token = localStorage.getItem('token') || '';
    const payload = decodeJwtPayload(token) || {};
    return {
        email: String(localStorage.getItem('email') || payload.email || payload.preferred_username || '').trim().toLowerCase(),
        id: String(localStorage.getItem('userId') || payload.userId || payload.userid || payload.uid || payload.sub || '').trim().toLowerCase(),
    };
}

function isPostOwnedByViewer(post) {
    const viewer = getCurrentViewer();
    if (!viewer.email && !viewer.id) return false;

    const ownerEmail = String(post?.email || post?.authorEmail || post?.userEmail || '').trim().toLowerCase();
    const ownerId = String(post?.userId || post?.ownerId || post?.authorId || post?.idUser || '').trim().toLowerCase();
    const authorRaw = String(post?.author || '').trim().toLowerCase();

    if (viewer.email && (ownerEmail === viewer.email || authorRaw === viewer.email)) return true;
    if (viewer.id && (ownerId === viewer.id || authorRaw === viewer.id)) return true;
    return false;
}

function EmbedModal({ postId, onClose }) {
    const iframeCode = `<iframe src="${window.location.origin}/embed/${postId}" width="560" height="315" frameborder="0" allowfullscreen></iframe>`;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content-custom bg-white p-4 shadow-lg rounded" style={{ maxWidth: 520, width: '90%' }} onClick={(e) => e.stopPropagation()}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="m-0 fw-bold"><i className="bi bi-code-slash me-2 text-primary"></i>Embed Slice</h5>
                    <button className="btn-close" onClick={onClose}></button>
                </div>
                <p className="text-secondary small mb-2">Copy and paste this code into your website:</p>
                <textarea className="form-control bg-light mb-3" rows="3" readOnly value={iframeCode} style={{ fontSize: '0.8rem', fontFamily: 'monospace' }} />
                <div className="d-flex justify-content-end gap-2">
                    <button className="btn btn-primary btn-sm px-3" onClick={() => { navigator.clipboard.writeText(iframeCode); alert('Copied to clipboard!'); }}>
                        <i className="bi bi-clipboard me-1"></i>Copy
                    </button>
                    <button className="btn btn-light btn-sm border" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

/* ── Single slice card ── */
function SliceCard({ post, onWatch, onDelete }) {
    const hls0 = (post.hlsVideoUrls && post.hlsVideoUrls[0]) || "";
    const hlsUrl = hls0 ? (`${PUBLIC_BASE}/` + hls0.split("webdata/")[1]) : "";
    const thumb = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? ""));

    const firstName = post.userFirstName || "";
    const lastName = post.userLastName || "";
    const ownerEmail = post.email || post.author || "";
    const initials = (firstName || lastName)
        ? (firstName.charAt(0) + lastName.charAt(0)).toUpperCase()
        : (ownerEmail ? ownerEmail.charAt(0).toUpperCase() : "👤");

    const avatarUrl = post.userProfileImageUrl && !post.userProfileImageUrl.includes('@')
        ? toPublicUrl(post.userProfileImageUrl)
        : null;

    const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
    const [likeCount, setLikeCount] = useState(post.likes || 0);

    // Sync state when props change
    useEffect(() => {
        setLiked(!!post.isLikedByCurrentUser);
        setLikeCount(post.likes || 0);
    }, [post.isLikedByCurrentUser, post.likes]);

    const [resolvedAvatar, setResolvedAvatar] = useState(avatarUrl);
    const [resolvedName, setResolvedName] = useState(ownerEmail || 'User');
    const [avatarError, setAvatarError] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showEmbed, setShowEmbed] = useState(false);
    const menuRef = useRef(null);
    const canDelete = isPostOwnedByViewer(post);

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!ownerEmail) return;

        getUserProfileCached(ownerEmail)
            .then((profile) => {
                const fetchedName = profile ? [profile.firstname, profile.lastname].filter(Boolean).join(' ') : null;
                if (fetchedName) setResolvedName(fetchedName);

                const url = profile?.profileImageUrl;
                if (url) {
                    setResolvedAvatar(toPublicUrl(url));
                } else {
                    const local = ownerEmail.split('@')[0];
                    setResolvedAvatar(toPublicUrl(`/profileImages/${local}.jpg`));
                }
            })
            .catch(() => {
                const local = ownerEmail.split('@')[0];
                setResolvedAvatar(toPublicUrl(`/profileImages/${local}.jpg`));
            });
    }, [ownerEmail]);

    const handleLike = async (e) => {
        e.stopPropagation();
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
            console.error("Slice like failed: ", err);
            setLiked(!newLiked);
            setLikeCount(c => newLiked ? c - 1 : c + 1);
        }
    };

    return (
        <>
            <article
                className="slice-card"
                data-id={post.id}
                onClick={() => onWatch?.({ ...post, hlsUrl })}
                style={{ cursor: onWatch ? 'pointer' : 'default' }}
            >
            {/* Thumbnail */}
            <div className="slice-thumb">
                {thumb
                    ? <img src={thumb} alt={post.title || "Slice"} />
                    : <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary bg-dark">
                        <i className="bi bi-play-circle fs-1 text-white opacity-50"></i>
                    </div>
                }

                <div className="position-absolute top-0 end-0 m-2" ref={menuRef} style={{ zIndex: 100 }}>
                    <button
                        className="btn btn-sm bg-white bg-opacity-75 rounded-circle shadow-sm d-flex align-items-center justify-content-center"
                        style={{ width: 28, height: 28 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen((v) => !v);
                        }}
                        aria-label="Slide actions"
                    >
                        <i className="bi bi-three-dots-vertical"></i>
                    </button>

                    {menuOpen && (
                        <div className="shadow-lg bg-white position-absolute end-0 mt-1 rounded py-1 border" style={{ minWidth: '130px' }}>
                            <button
                                className="dropdown-item py-2 px-3 small d-flex align-items-center gap-2 text-dark"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowEmbed(true);
                                    setMenuOpen(false);
                                }}
                            >
                                <i className="bi bi-code-slash"></i> Embed
                            </button>

                            {canDelete && (
                                <>
                                    <hr className="my-1" />
                                    <button
                                        className="dropdown-item py-2 px-3 small text-danger d-flex align-items-center gap-2"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpen(false);
                                            onDelete?.(post.id);
                                        }}
                                    >
                                        <i className="bi bi-trash"></i> Delete
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="slice-thumb-overlay">
                    <div className="slice-overlay-title" title={post.title || "Untitled Slice"}>
                        {post.title || "Untitled Slice"}
                    </div>

                    <div className="slice-meta-top">
                        {/* Owner avatar */}
                        <div className="slice-owner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#6f42c1', '#fd7e14'][resolvedName.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 7] }} title={resolvedName}>
                            {resolvedAvatar && !avatarError
                                ? <img src={resolvedAvatar} alt={resolvedName} className="slice-owner-img" onError={() => setAvatarError(true)} />
                                : <span className="text-white fw-bold" style={{ fontSize: 13 }}>{resolvedName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "👤"}</span>
                            }
                        </div>

                        {/* Stats */}
                        <div className="slice-stats">
                            <span className="slice-views">
                                <i className="bi bi-eye"></i> {post.views || 0}
                            </span>
                            <button
                                className="slice-like-btn"
                                onClick={handleLike}
                                aria-pressed={liked}
                            >
                                {liked ? "❤️" : "🤍"} <span>{likeCount}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            </article>

            {showEmbed && <EmbedModal postId={post.id} onClose={() => setShowEmbed(false)} />}
        </>
    );
}

/* ═══════════════════════════════════════════
   MAIN SLICE CAROUSEL COMPONENT
═══════════════════════════════════════════ */
export default function SliceCarousel({ onWatch, onDelete }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const showRefreshing = useDelayedVisibility(isRefreshing, {
        showDelayMs: 120,
        minVisibleMs: 420,
    });
    const railRef = useRef(null);
    const prevRef = useRef(null);
    const nextRef = useRef(null);
    const didRunInitialFetch = useRef(false);

    useEffect(() => {
        if (didRunInitialFetch.current) return;
        didRunInitialFetch.current = true;

        getSlicePostsCached()
            .then(setPosts)
            .catch(err => console.error("Slice fetch error:", err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const unsubscribe = subscribePostsCacheUpdates(({ key, items }) => {
            const tokenKey = localStorage.getItem('token') || 'anonymous';
            if (key !== tokenKey) return;
            setPosts(items.filter((p) => p.slice === true));
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        const unsubscribe = subscribePostsRefreshStatus(({ key, refreshing }) => {
            const tokenKey = localStorage.getItem('token') || 'anonymous';
            if (key !== tokenKey) return;
            setIsRefreshing(refreshing);
        });

        return unsubscribe;
    }, []);

    /* Arrow visibility (mirrors app.js updateArrows) */
    const updateArrows = () => {
        const rail = railRef.current;
        const prevBtn = prevRef.current;
        const nextBtn = nextRef.current;
        if (!rail || !prevBtn || !nextBtn) return;

        const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
        const x = rail.scrollLeft;
        const eps = 5;

        prevBtn.style.opacity = x <= eps ? "0" : "1";
        prevBtn.style.pointerEvents = x <= eps ? "none" : "auto";
        nextBtn.style.opacity = x >= max - eps ? "0" : "1";
        nextBtn.style.pointerEvents = x >= max - eps ? "none" : "auto";
    };

    useEffect(() => {
        const rail = railRef.current;
        if (!rail) return;
        rail.addEventListener("scroll", updateArrows, { passive: true });
        window.addEventListener("resize", updateArrows);
        updateArrows();
        return () => {
            rail.removeEventListener("scroll", updateArrows);
            window.removeEventListener("resize", updateArrows);
        };
    }, [posts]);

    const scrollByCards = (dir) => {
        const rail = railRef.current;
        if (!rail) return;
        const first = rail.querySelector(".slice-card");
        const cardW = first ? first.getBoundingClientRect().width : 220;
        const gap = 16;
        rail.scrollBy({ left: dir * (cardW + gap) * 2, behavior: "smooth" });
    };

    if (loading) {
        return (
            <div id="slice-carousel" className="mb-3">
                <div className="d-flex gap-3 px-2 overflow-hidden" style={{ height: 322 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex-shrink-0 rounded-3 bg-light" style={{ width: 180, height: '100%', opacity: 0.6 }}></div>
                    ))}
                </div>
            </div>
        );
    }

    if (!posts.length) return null;

    return (
        <div id="slice-carousel" className="mb-3">
            {showRefreshing && (
                <div className="mb-2 px-2">
                    <span className="badge rounded-pill text-bg-light border text-secondary d-inline-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                        Refreshing slices...
                    </span>
                </div>
            )}
            <div className="slice-wrap">
                {/* Rail */}
                <div className="slice-rail" ref={railRef}>
                    {posts.map(p => (
                        <SliceCard key={p.id} post={p} onWatch={onWatch} onDelete={onDelete} />
                    ))}
                </div>

                {/* Arrows */}
                <button
                    className="slice-arrow slice-prev"
                    id="slice-prev"
                    aria-label="Previous"
                    ref={prevRef}
                    onClick={() => scrollByCards(-1)}
                >
                    ‹
                </button>
                <button
                    className="slice-arrow slice-next"
                    id="slice-next"
                    aria-label="Next"
                    ref={nextRef}
                    onClick={() => scrollByCards(1)}
                >
                    ›
                </button>
            </div>
        </div>
    );
}
