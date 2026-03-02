import React, { useState, useEffect, useRef } from 'react';

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

/* ── Fetch all slice posts (mirrors app.js fetchAllSlicePosts) ── */
async function fetchSlicePosts(pageSize = 30) {
    const token = localStorage.getItem("token");
    if (!token) return [];
    const query = `
    query($page: Int!, $size: Int!) {
      getAllPostsPaged(page: $page, size: $size) {
        items {
          id
          title: description
          imageUrls
          videoImagePath
          hlsVideoUrls
          slice
          views
          likes
          isLikedByCurrentUser
          userProfileImageUrl
          userFirstName
          userLastName
          email
          author
        }
        pageInfo { page size hasNext }
      }
    }
  `;

    let page = 0;
    let all = [];

    while (true) {
        const res = await fetch(`${API_BASE}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ query, variables: { page, size: pageSize } }),
        });
        const json = await res.json();
        const data = json?.data?.getAllPostsPaged;
        if (!data) break;

        /* Only keep slice === true */
        const sliceItems = (data.items || []).filter(p => p.slice === true);
        all = all.concat(sliceItems);

        if (!data.pageInfo?.hasNext) break;
        page += 1;
    }
    return all;
}

/* ── Single slice card ── */
function SliceCard({ post, onWatch }) {
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

    const handleLike = async (e) => {
        e.stopPropagation();
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

    return (
        <article
            className="slice-card"
            data-id={post.id}
            onClick={() => onWatch && onWatch({ ...post, hlsUrl })}
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
            </div>

            {/* Meta */}
            <div className="slice-meta">
                <div className="slice-meta-top">
                    {/* Owner avatar */}
                    <div className="slice-owner">
                        {avatarUrl
                            ? <img src={avatarUrl} alt={ownerEmail} className="slice-owner-img" onError={e => e.target.style.display = 'none'} />
                            : <span>{initials}</span>
                        }
                    </div>

                    {/* Stats */}
                    <div className="slice-stats">
                        <span className="slice-views">
                            👁️ {post.views || 0}
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

                <div className="slice-title" title={post.title || "Untitled"}>
                    {post.title || "Untitled"}
                </div>
            </div>
        </article>
    );
}

/* ═══════════════════════════════════════════
   MAIN SLICE CAROUSEL COMPONENT
═══════════════════════════════════════════ */
export default function SliceCarousel({ onWatch }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const railRef = useRef(null);
    const prevRef = useRef(null);
    const nextRef = useRef(null);

    useEffect(() => {
        fetchSlicePosts(30)
            .then(setPosts)
            .catch(err => console.error("Slice fetch error:", err))
            .finally(() => setLoading(false));
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
                <div className="d-flex gap-3 px-2 overflow-hidden" style={{ height: 280 }}>
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
            <div className="slice-wrap">
                {/* Rail */}
                <div className="slice-rail" ref={railRef}>
                    {posts.map(p => (
                        <SliceCard key={p.id} post={p} onWatch={onWatch} />
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
