import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';

function publicUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = String(path).replaceAll('\\', '/');
  const webdata = normalized.indexOf('/webdata/');
  const relative = webdata >= 0 ? normalized.slice(webdata + '/webdata'.length) : normalized;
  return `${PUBLIC_BASE}${relative.startsWith('/') ? relative : `/${relative}`}`;
}

function EmbeddedVideo({ source, poster }) {
  const ref = useRef(null);
  const url = publicUrl(source);

  useEffect(() => {
    const video = ref.current;
    if (!video || !url) return undefined;
    if (/\.m3u8(\?|$)/i.test(url) && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    video.src = url;
    return undefined;
  }, [url]);

  return <video ref={ref} controls playsInline preload="metadata" poster={publicUrl(poster)} />;
}

EmbeddedVideo.propTypes = { source: PropTypes.string.isRequired, poster: PropTypes.string };

export default function EmbeddedContentPage({ postId }) {
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($id: String!) { getPostById(id: $id) { id title description content hlsVideoUrls videoUrls imageUrls videoImagePath } }`,
        variables: { id: postId },
      }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload.errors?.length || !payload.data?.getPostById) {
          throw new Error(payload.errors?.[0]?.message || 'Content is unavailable.');
        }
        setPost(payload.data.getPostById);
      })
      .catch((requestError) => setError(requestError.message || 'Content is unavailable.'));
  }, [postId]);

  if (error) return <main className="embedded-content-page embedded-content-message">{error}</main>;
  if (!post) return <main className="embedded-content-page embedded-content-message">Loading content…</main>;

  const video = post.hlsVideoUrls?.[0] || post.videoUrls?.[0] || '';
  const images = [...new Set((post.imageUrls || []).filter(Boolean))];
  return (
    <main className="embedded-content-page">
      <article>
        {video && <EmbeddedVideo source={video} poster={post.videoImagePath || images[0]} />}
        {!video && images.map((image) => <img key={image} src={publicUrl(image)} alt={post.title || 'Embedded content'} />)}
        {(post.title || post.description || post.content) && (
          <header>
            {post.title && <h1>{post.title}</h1>}
            {(post.description || post.content) && <p>{post.description || post.content}</p>}
          </header>
        )}
      </article>
    </main>
  );
}

EmbeddedContentPage.propTypes = { postId: PropTypes.string.isRequired };
