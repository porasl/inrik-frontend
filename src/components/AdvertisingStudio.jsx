import React, { useEffect, useMemo, useState } from 'react';
import {
  cancelAdvertisement, createAdvertisement, createStripeCheckout, currentRole, getAdvertisementAnalytics,
  getAdvertisementViews, getStoreCreditWallet, getStripeStatus, listMyAdvertisements, updateAdvertisement, updateAdvertisementStatus,
} from '../services/advertisementsService';

const TEMPLATES = [
  { id: 'transparent-popup', name: 'Transparent image popup', icon: 'bi-window-stack' },
  { id: 'lower-third', name: 'Lower-third promotion', icon: 'bi-layout-text-window-reverse' },
  { id: 'corner-card', name: 'Corner offer card', icon: 'bi-badge-ad' },
];
const POSITIONS = [
  { top: '8%', left: '7%' }, { top: '10%', right: '7%' }, { top: '34%', left: '8%' },
  { top: '32%', right: '8%' }, { bottom: '9%', left: '9%' }, { bottom: '9%', right: '9%' },
];
const split = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
const money = (value) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export default function AdvertisingStudio() {
  const [form, setForm] = useState({
    templateId: 'transparent-popup', headline: 'A brighter story starts here',
    message: 'Introduce your product with a short, clear message.', buttonLabel: 'Learn more',
    destination: 'https://', opacity: 82, randomPlacement: true, budget: '25',
    costPerView: '0.05', maxViews: '500', targetUserIds: '', targetUserEmails: '',
    targetLocations: '', targetProfileTags: '', activate: true, paymentMethod: 'STORE_CREDIT',
  });
  const [editingId, setEditingId] = useState('');
  const [wallet, setWallet] = useState({ balance: 0, ledger: [] });
  const [stripeStatus, setStripeStatus] = useState({ configured: false });
  const [fundAmount, setFundAmount] = useState('25');
  const [positionIndex, setPositionIndex] = useState(1);
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewPopup, setViewPopup] = useState(null);
  const [viewDetails, setViewDetails] = useState([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const isAdmin = currentRole() === 'ADMIN';
  const selectedTemplate = useMemo(() => TEMPLATES.find((item) => item.id === form.templateId), [form.templateId]);
  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const load = async () => {
    try {
      const [mine, admin, credit, stripe] = await Promise.all([
        listMyAdvertisements(),
        isAdmin ? getAdvertisementAnalytics() : Promise.resolve(null),
        getStoreCreditWallet(),
        getStripeStatus(),
      ]);
      setCampaigns(mine || []);
      setAnalytics(admin);
      setWallet(credit || { balance: 0, ledger: [] });
      setStripeStatus(stripe || { configured: false });
    } catch (error) {
      setStatus(error.message);
    }
  };
  useEffect(() => { load(); }, []);

  const publish = async () => {
    setBusy(true); setStatus('');
    try {
      const payload = {
        ...form,
        opacity: Number(form.opacity), budget: Number(form.budget),
        costPerView: Number(form.costPerView), maxViews: Number(form.maxViews),
        targetUserIds: split(form.targetUserIds), targetUserEmails: split(form.targetUserEmails),
        targetLocations: split(form.targetLocations), targetProfileTags: split(form.targetProfileTags),
      };
      if (editingId) await updateAdvertisement(editingId, payload);
      else await createAdvertisement(payload);
      setStatus(editingId ? 'Campaign updated.' : form.activate ? 'Campaign published.' : 'Draft saved.');
      setEditingId('');
      await load();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const setCampaignStatus = async (id, nextStatus) => {
    try {
      await updateAdvertisementStatus(id, nextStatus);
      await load();
    } catch (error) { setStatus(error.message); }
  };

  const fundWithStripe = async () => {
    setBusy(true); setStatus('');
    try {
      const checkout = await createStripeCheckout(Number(fundAmount));
      if (!checkout?.checkoutUrl) throw new Error('Stripe Checkout URL was not returned.');
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setStatus(error.message);
      setBusy(false);
    }
  };

  const editCampaign = (campaign) => {
    setEditingId(campaign.id);
    setForm({
      templateId: campaign.templateId, headline: campaign.headline, message: campaign.message || '',
      buttonLabel: campaign.buttonLabel || 'Learn more', destination: campaign.destination,
      opacity: campaign.opacity || 82, randomPlacement: campaign.randomPlacement !== false,
      budget: String(campaign.budget), costPerView: String(campaign.costPerView),
      maxViews: String(campaign.maxViews || ''), targetUserIds: (campaign.targetUserIds || []).join(', '),
      targetUserEmails: (campaign.targetUserEmails || []).join(', '),
      targetLocations: (campaign.targetLocations || []).join(', '),
      targetProfileTags: (campaign.targetProfileTags || []).join(', '),
      activate: campaign.status === 'ACTIVE', paymentMethod: campaign.paymentMethod || 'STORE_CREDIT',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelCampaign = async (campaign) => {
    if (!window.confirm(`Cancel "${campaign.headline}" and return its unused budget to Store Credit?`)) return;
    try {
      const result = await cancelAdvertisement(campaign.id);
      setStatus(`Campaign cancelled. ${money(result.refundedAmount)} returned to Store Credit.`);
      if (editingId === campaign.id) setEditingId('');
      await load();
    } catch (error) { setStatus(error.message); }
  };

  const showViews = async (campaign) => {
    setViewPopup(campaign);
    setViewDetails([]);
    setViewsLoading(true);
    try {
      setViewDetails(await getAdvertisementViews(campaign.id) || []);
    } catch (error) {
      setStatus(error.message);
      setViewPopup(null);
    } finally {
      setViewsLoading(false);
    }
  };

  return (
    <section className="advertising-studio">
      <header className="advertising-studio__header">
        <div><span className="advertising-studio__eyebrow">Personalized campaign builder</span>
          <h2>Advertising Studio</h2>
          <p>Target signed-in viewers and stop delivery automatically when budget or view limits are reached.</p>
        </div>
        <button type="button" className="btn btn-dark" disabled={busy} onClick={publish}>
          {busy ? 'Saving…' : editingId ? 'Save changes' : form.activate ? 'Publish campaign' : 'Save draft'}
        </button>
      </header>

      <section className="advertising-credit">
        <div><span className="advertising-studio__eyebrow">Account Store Credit</span><strong>{money(wallet.balance)}</strong>
          <small>Campaigns spend Store Credit. Stripe is the only way to purchase more.</small></div>
        <label>Amount (USD)<input type="number" min="1" max="10000" step="1" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} /></label>
        <button type="button" className="btn btn-primary" disabled={busy || !stripeStatus.configured} onClick={fundWithStripe}>
          <i className="bi bi-credit-card me-2" />Add credit with Stripe
        </button>
        {!stripeStatus.configured && <small className="text-danger">Stripe keys and webhook secret must be configured by the administrator.</small>}
      </section>

      <div className="advertising-studio__workspace">
        <aside className="advertising-studio__templates">
          <div className="advertising-studio__section-title"><span>Templates</span><small>{TEMPLATES.length} available</small></div>
          {TEMPLATES.map((template, index) => (
            <button type="button" key={template.id} className={`advertising-template ${form.templateId === template.id ? 'is-selected' : ''}`} onClick={() => field('templateId', template.id)}>
              <span className="advertising-template__number">0{index + 1}</span><i className={`bi ${template.icon}`} />
              <span><strong>{template.name}</strong><small>Dismissible and personalized per signed-in viewer.</small></span>
            </button>
          ))}
        </aside>

        <div className="advertising-studio__editor">
          <div className="advertising-studio__section-title"><span>Campaign</span><small>{selectedTemplate?.name}</small></div>
          <label>Headline<input value={form.headline} maxLength="70" onChange={(event) => field('headline', event.target.value)} /></label>
          <label>Message<textarea value={form.message} rows="3" maxLength="180" onChange={(event) => field('message', event.target.value)} /></label>
          <div className="advertising-studio__field-row">
            <label>Button label<input value={form.buttonLabel} onChange={(event) => field('buttonLabel', event.target.value)} /></label>
            <label>Destination<input value={form.destination} onChange={(event) => field('destination', event.target.value)} /></label>
          </div>
          <label>Payment method<input value={`Store Credit (${money(wallet.balance)} available)`} readOnly /></label>
          <div className="advertising-studio__field-row">
            <label>Budget (USD)<input type="number" min="0.01" step="0.01" value={form.budget} onChange={(event) => field('budget', event.target.value)} /></label>
            <label>Cost per view<input type="number" min="0.0001" step="0.01" value={form.costPerView} onChange={(event) => field('costPerView', event.target.value)} /></label>
          </div>
          <label>Maximum views<input type="number" min="1" value={form.maxViews} onChange={(event) => field('maxViews', event.target.value)} /></label>
          <div className="advertising-targeting">
            <strong>Viewer targeting</strong><small>Leave all targeting fields empty to reach any signed-in user.</small>
            <label>User emails<input placeholder="user@example.com, another@example.com" value={form.targetUserEmails} onChange={(event) => field('targetUserEmails', event.target.value)} /></label>
            <label>User IDs<input placeholder="12, 42" value={form.targetUserIds} onChange={(event) => field('targetUserIds', event.target.value)} /></label>
            <label>Locations<input placeholder="San Francisco, US, America/Los_Angeles" value={form.targetLocations} onChange={(event) => field('targetLocations', event.target.value)} /></label>
            <label>Profile tags<input placeholder="technology, travel" value={form.targetProfileTags} onChange={(event) => field('targetProfileTags', event.target.value)} /></label>
          </div>
          <label className="advertising-studio__range"><span>Background opacity <b>{form.opacity}%</b></span><input type="range" min="35" max="100" value={form.opacity} onChange={(event) => field('opacity', Number(event.target.value))} /></label>
          <label className="advertising-studio__switch"><input type="checkbox" checked={form.activate} onChange={(event) => field('activate', event.target.checked)} /><span><strong>Activate after saving</strong><small>Draft campaigns are not delivered.</small></span></label>
          {editingId && <button type="button" className="btn btn-sm btn-outline-secondary mb-2" onClick={() => setEditingId('')}>Cancel editing</button>}
          {status && <div className="alert alert-info py-2 mb-0">{status}</div>}
        </div>

        <div className="advertising-studio__preview-panel">
          <div className="advertising-studio__section-title"><span>Live preview</span><button type="button" onClick={() => setPositionIndex((positionIndex + 1) % POSITIONS.length)}><i className="bi bi-shuffle" /> Randomize</button></div>
          <div className="advertising-preview"><div className="advertising-preview__scene">
            <div className={`advertising-preview__ad advertising-preview__ad--${form.templateId}`} style={{ ...POSITIONS[positionIndex], '--ad-opacity': form.opacity / 100 }}>
              <button type="button" className="advertising-preview__close">×</button><span className="advertising-preview__sponsor">Sponsored</span>
              <strong>{form.headline || 'Your headline'}</strong><p>{form.message}</p><button type="button" className="advertising-preview__cta">{form.buttonLabel}</button>
            </div>
          </div></div>
          <div className="advertising-studio__notes"><span>Budget {money(form.budget)}</span><span>Up to {form.maxViews || 0} views</span><span>{money(form.costPerView)} / view</span></div>
        </div>
      </div>

      <section className="advertising-campaigns">
        <div className="advertising-studio__section-title"><span>My campaigns</span><small>{campaigns.length} campaigns</small></div>
        <div className="table-responsive"><table className="table align-middle">
          <thead><tr><th>Campaign</th><th>Status</th><th>Views</th><th>Spend</th><th>Remaining</th><th>Control</th></tr></thead>
          <tbody>{campaigns.map((campaign) => <tr key={campaign.id}>
            <td><strong>{campaign.headline}</strong><small className="d-block text-muted">{campaign.templateId}</small></td>
            <td><span className={`badge text-bg-${campaign.status === 'ACTIVE' ? 'success' : campaign.status === 'EXHAUSTED' ? 'danger' : 'secondary'}`}>{campaign.status}</span></td>
            <td>{campaign.viewCount} / {campaign.maxViews || '∞'}</td><td>{money(campaign.spend)}</td><td>{money(campaign.remainingBudget)}</td>
            <td><div className="d-flex flex-wrap gap-1">
              <button className="btn btn-sm btn-outline-dark" onClick={() => showViews(campaign)}>
                <i className="bi bi-eye me-1" />View details
              </button>
              <button className="btn btn-sm btn-outline-primary" disabled={campaign.status === 'CANCELLED'} onClick={() => editCampaign(campaign)}>Edit</button>
              {campaign.status === 'ACTIVE'
                ? <button className="btn btn-sm btn-outline-secondary" onClick={() => setCampaignStatus(campaign.id, 'PAUSED')}>Pause</button>
                : <button className="btn btn-sm btn-outline-success" disabled={['EXHAUSTED', 'CANCELLED'].includes(campaign.status)} onClick={() => setCampaignStatus(campaign.id, 'ACTIVE')}>Activate</button>}
              <button className="btn btn-sm btn-outline-danger" disabled={campaign.status === 'CANCELLED'} onClick={() => cancelCampaign(campaign)}>Cancel</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      {viewPopup && <div className="advertising-views-backdrop" role="presentation" onMouseDown={() => setViewPopup(null)}>
        <section className="advertising-views-modal" role="dialog" aria-modal="true" aria-labelledby="advertising-views-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="advertising-studio__eyebrow">Impression history</span>
            <h3 id="advertising-views-title">{viewPopup.headline}</h3>
            <p>{viewPopup.viewCount} recorded views · {money(viewPopup.spend)} spent</p></div>
            <button type="button" aria-label="Close view details" onClick={() => setViewPopup(null)}>×</button>
          </header>
          <div className="advertising-views-modal__body">
            {viewsLoading && <div className="text-center p-4"><span className="spinner-border spinner-border-sm me-2" />Loading view history…</div>}
            {!viewsLoading && viewDetails.length === 0 && <div className="advertising-views-empty"><i className="bi bi-eye-slash" /><strong>No views yet</strong><span>Delivery details will appear after the first impression.</span></div>}
            {!viewsLoading && viewDetails.map((view, index) => <article className="advertising-view-event" key={view.id}>
              <div className="advertising-view-event__marker">{viewDetails.length - index}</div>
              <div><strong>{new Date(view.viewedAt).toLocaleString()}</strong>
                <span>{view.deviceType || 'Unknown device'} · {view.browser || 'Unknown browser'} · {view.viewportWidth && view.viewportHeight ? `${view.viewportWidth}×${view.viewportHeight}` : 'Unknown screen'}</span>
                <span>{view.placement || 'Unknown placement'} · {[view.city, view.region, view.country].filter(Boolean).join(', ') || 'Location unavailable'}</span>
                <span>{view.timezone || 'Unknown timezone'} · {view.language || 'Unknown language'}</span>
                <span title={view.pageUrl}>{view.pageUrl || 'Page unavailable'}</span>
              </div>
              <b>{money(view.chargedAmount)}</b>
            </article>)}
          </div>
          <footer><i className="bi bi-shield-lock me-2" />Viewer identity, IP address, and profile data remain visible only to administrators.</footer>
        </section>
      </div>}

      {isAdmin && analytics && <section className="advertising-admin">
        <div className="advertising-studio__section-title"><span>Administrator analytics</span><small>MySQL ADMIN role required · Total spend {money(analytics.totalSpend)}</small></div>
        <div className="advertising-admin__summary">
          <div><strong>{analytics.campaigns?.length || 0}</strong><span>All campaigns</span></div>
          <div><strong>{analytics.views?.length || 0}</strong><span>Paid views</span></div>
          <div><strong>{money(analytics.totalSpend)}</strong><span>Total spending</span></div>
        </div>
        <div className="advertising-admin__tables">
          <div><h6>Views by location</h6>{Object.entries(analytics.viewsByLocation || {}).map(([name, count]) => <p key={name}><span>{name}</span><strong>{count}</strong></p>)}</div>
          <div><h6>Views by user profile</h6>{Object.entries(analytics.viewsByProfile || {}).map(([name, count]) => <p key={name}><span>{name}</span><strong>{count}</strong></p>)}</div>
        </div>
        <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Viewer</th><th>Location</th><th>Campaign</th><th>Charge</th><th>Time</th></tr></thead>
          <tbody>{(analytics.views || []).slice(0, 100).map((view) => <tr key={view.id}><td>{view.viewerEmail}</td><td>{[view.city, view.region, view.country].filter(Boolean).join(', ') || 'Unknown'}</td><td>{view.advertisementId}</td><td>{money(view.chargedAmount)}</td><td>{new Date(view.viewedAt).toLocaleString()}</td></tr>)}</tbody>
        </table></div>
      </section>}
    </section>
  );
}
