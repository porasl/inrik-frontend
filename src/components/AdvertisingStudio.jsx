import React, { useEffect, useMemo, useState } from 'react';
import {
  cancelAdvertisement, createAdvertisement, createStripeCheckout, currentRole, getAdvertisementAnalytics,
  getAdvertisementConfiguration, getAdvertisementViews, getStoreCreditWallet, getStripeStatus,
  listMyAdvertisements, updateAdvertisement, updateAdvertisementConfiguration, updateAdvertisementStatus,
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
const CONTINENTS = [
  ['africa', 'Africa'], ['asia', 'Asia'], ['europe', 'Europe'],
  ['north_america', 'North America'], ['south_america', 'South America'],
  ['oceania', 'Oceania'], ['antarctica', 'Antarctica'],
];
const COUNTRY_CODES = (
  'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ '
  + 'CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI '
  + 'FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM '
  + 'JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG '
  + 'MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK '
  + 'PL PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD '
  + 'TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW'
).split(' ');
const countryNames = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' });
const COUNTRIES = COUNTRY_CODES
  .map((code) => [code, countryNames.of(code) || code])
  .sort((left, right) => left[1].localeCompare(right[1]));
const split = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
const selectedValues = (event) => Array.from(event.target.selectedOptions, (option) => option.value);
const money = (value) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export default function AdvertisingStudio() {
  const [form, setForm] = useState({
    templateId: 'transparent-popup', headline: 'A brighter story starts here',
    message: 'Introduce your product with a short, clear message.', buttonLabel: 'Learn more',
    destination: 'https://', mediaType: 'NONE', mediaUrl: '',
    opacity: 82, randomPlacement: true, budget: '25',
    costPerView: '0.05', maxViews: '500', targetUserEmails: '',
    targetCountries: [], targetContinents: [],
    targetLocations: '', targetProfileTags: '', targetContentKeywords: '',
    targetContentCategories: '', deliveryMode: 'ONCE_PER_SESSION',
    activate: true, paymentMethod: 'STORE_CREDIT',
  });
  const [editingId, setEditingId] = useState('');
  const [wallet, setWallet] = useState({ balance: 0, ledger: [] });
  const [stripeStatus, setStripeStatus] = useState({ configured: false });
  const [fundAmount, setFundAmount] = useState('25');
  const [positionIndex, setPositionIndex] = useState(1);
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [runtimeConfiguration, setRuntimeConfiguration] = useState({ alwaysShowForTesting: true });
  const [configurationBusy, setConfigurationBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewPopup, setViewPopup] = useState(null);
  const [viewDetails, setViewDetails] = useState([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const isAdmin = currentRole() === 'ADMIN';
  const selectedTemplate = useMemo(() => TEMPLATES.find((item) => item.id === form.templateId), [form.templateId]);
  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const load = async () => {
    const requests = [
      ['campaigns', listMyAdvertisements()],
      ['wallet', getStoreCreditWallet()],
      ['Stripe status', getStripeStatus()],
    ];
    if (isAdmin) {
      requests.push(['administrator analytics', getAdvertisementAnalytics()]);
      requests.push(['runtime configuration', getAdvertisementConfiguration()]);
    }

    const results = await Promise.allSettled(requests.map(([, request]) => request));
    const failures = [];
    results.forEach((result, index) => {
      const [name] = requests[index];
      if (result.status === 'rejected') {
        failures.push(`${name}: ${result.reason?.message || 'request failed'}`);
        return;
      }
      if (name === 'campaigns') setCampaigns(result.value || []);
      if (name === 'wallet') setWallet(result.value || { balance: 0, ledger: [] });
      if (name === 'Stripe status') setStripeStatus(result.value || { configured: false });
      if (name === 'administrator analytics') setAnalytics(result.value);
      if (name === 'runtime configuration') setRuntimeConfiguration(result.value);
    });
    setStatus(failures.length ? `Some advertising data could not load — ${failures.join('; ')}` : '');
  };
  useEffect(() => { load(); }, []);

  const publish = async () => {
    setBusy(true); setStatus('');
    try {
      const payload = {
        ...form,
        opacity: Number(form.opacity), budget: Number(form.budget),
        costPerView: Number(form.costPerView), maxViews: Number(form.maxViews),
        targetUserEmails: split(form.targetUserEmails),
        targetCountries: form.targetCountries,
        targetContinents: form.targetContinents,
        targetLocations: split(form.targetLocations), targetProfileTags: split(form.targetProfileTags),
        targetContentKeywords: split(form.targetContentKeywords),
        targetContentCategories: split(form.targetContentCategories),
      };
      if (editingId) await updateAdvertisement(editingId, payload);
      else await createAdvertisement(payload);
      setStatus(editingId ? 'Campaign updated.' : form.activate ? 'Campaign published.' : 'Draft saved.');
      setEditingId('');
      await load();
    } catch (error) {
      if (error.status === 402) {
        const required = Number(form.budget || 0);
        const available = Number(wallet.balance || 0);
        const shortage = Math.max(0, required - available);
        setStatus(
          `Insufficient Store Credit. This campaign reserves ${money(required)}, `
          + `but only ${money(available)} is available. Add ${money(shortage)} `
          + 'or reduce the campaign budget before saving.'
        );
      } else {
        setStatus(error.message);
      }
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

  const toggleAlwaysShow = async (enabled) => {
    setConfigurationBusy(true);
    setStatus('');
    try {
      const updated = await updateAdvertisementConfiguration(enabled);
      setRuntimeConfiguration(updated);
      setStatus(`Advertisement test mode is now ${enabled ? 'ON' : 'OFF'}. The change is active immediately.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setConfigurationBusy(false);
    }
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
      mediaType: campaign.mediaType || 'NONE', mediaUrl: campaign.mediaUrl || '',
      opacity: campaign.opacity || 82, randomPlacement: campaign.randomPlacement !== false,
      budget: String(campaign.budget), costPerView: String(campaign.costPerView),
      maxViews: String(campaign.maxViews || ''),
      targetUserEmails: (campaign.targetUserEmails || []).join(', '),
      targetCountries: campaign.targetCountries || [],
      targetContinents: campaign.targetContinents || [],
      targetLocations: (campaign.targetLocations || []).join(', '),
      targetProfileTags: (campaign.targetProfileTags || []).join(', '),
      targetContentKeywords: (campaign.targetContentKeywords || []).join(', '),
      targetContentCategories: (campaign.targetContentCategories || []).join(', '),
      deliveryMode: campaign.deliveryMode || 'ONCE_PER_SESSION',
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

      {isAdmin && <section className="advertising-credit">
        <div>
          <span className="advertising-studio__eyebrow">Global delivery configuration</span>
          <strong>Advertisement test mode</strong>
          <small>When ON, active funded campaigns ignore viewer, location, context, and session targeting.</small>
        </div>
        <label className="advertising-studio__switch">
          <input
            type="checkbox"
            checked={runtimeConfiguration?.alwaysShowForTesting === true}
            disabled={configurationBusy}
            onChange={(event) => toggleAlwaysShow(event.target.checked)}
          />
          <span>
            <strong>{runtimeConfiguration?.alwaysShowForTesting ? 'Always show: ON' : 'Normal targeting: ON'}</strong>
            <small>Global and immediate; no service restart is needed.</small>
          </span>
        </label>
      </section>}

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
          <div className="advertising-targeting">
            <strong>Popup media content</strong>
            <label>Content type
              <select value={form.mediaType} onChange={(event) => field('mediaType', event.target.value)}>
                <option value="NONE">Text only</option>
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Short video clip</option>
              </select>
            </label>
            {form.mediaType !== 'NONE' && (
              <label>{form.mediaType === 'IMAGE' ? 'Image URL' : 'Video clip URL'}
                <input
                  type="url"
                  placeholder={form.mediaType === 'IMAGE' ? 'https://example.com/ad-image.jpg' : 'https://example.com/ad-clip.mp4'}
                  value={form.mediaUrl}
                  onChange={(event) => field('mediaUrl', event.target.value)}
                />
              </label>
            )}
            <small>Use a public HTTPS URL. Video clips play muted and loop inside the advertisement.</small>
          </div>
          <label>Payment method<input value={`Store Credit (${money(wallet.balance)} available)`} readOnly /></label>
          <div className="advertising-studio__field-row">
            <label>Budget (USD)<input type="number" min="0.01" step="0.01" value={form.budget} onChange={(event) => field('budget', event.target.value)} /></label>
            <label>Cost per view<input type="number" min="0.0001" step="0.01" value={form.costPerView} onChange={(event) => field('costPerView', event.target.value)} /></label>
          </div>
          <label>Maximum views<input type="number" min="1" value={form.maxViews} onChange={(event) => field('maxViews', event.target.value)} /></label>
          <div className="advertising-targeting">
            <strong>Delivery frequency</strong>
            <label>Display rule
              <select value={form.deliveryMode} onChange={(event) => field('deliveryMode', event.target.value)}>
                <option value="ONCE_PER_SESSION">Once per browser session for each unique user</option>
                <option value="CONTEXTUAL_VIDEO">On each matching video or image, once per item/session</option>
              </select>
            </label>
            <small>
              {form.deliveryMode === 'ONCE_PER_SESSION'
                ? 'The first eligible video can show this campaign. Refreshing the page will not charge another view during the same session.'
                : 'The campaign is evaluated whenever a video or image opens and appears only when its title, description, or category matches.'}
            </small>
          </div>
          <div className="advertising-targeting">
            <strong>Viewer targeting</strong><small>Leave all targeting fields empty to reach signed-in and anonymous viewers.</small>
            <label>User email patterns<input placeholder="user@example.com, *@*.de, *@**.de" value={form.targetUserEmails} onChange={(event) => field('targetUserEmails', event.target.value)} /></label>
            <small>Separate entries with commas. Use an exact email or * as a wildcard; for example, *@*.de matches email addresses ending in .de.</small>
            <div className="advertising-studio__field-row">
              <label>Target continents
                <select multiple size="5" value={form.targetContinents} onChange={(event) => field('targetContinents', selectedValues(event))}>
                  {CONTINENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Target countries
                <select multiple size="5" value={form.targetCountries} onChange={(event) => field('targetCountries', selectedValues(event))}>
                  {COUNTRIES.map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}
                </select>
              </label>
            </div>
            <small>Use Ctrl/Command-click to select several. An exact country campaign ranks above a matching continent campaign.</small>
            <label>Locations<input placeholder="San Francisco, US, America/Los_Angeles" value={form.targetLocations} onChange={(event) => field('targetLocations', event.target.value)} /></label>
            <label>Profile tags<input placeholder="technology, travel" value={form.targetProfileTags} onChange={(event) => field('targetProfileTags', event.target.value)} /></label>
          </div>
          <div className="advertising-targeting">
            <strong>Context Targeting</strong>
            <small>Used by contextual media delivery. Matching is case-insensitive against the video or image title, description, categories, and tags.</small>
            <label>Topics or description keywords<input placeholder="sport, football, cosmetics, skin care" value={form.targetContentKeywords} onChange={(event) => field('targetContentKeywords', event.target.value)} /></label>
            <label>Content categories<input placeholder="Sport, Men, Women, Children, Cosmetics" value={form.targetContentCategories} onChange={(event) => field('targetContentCategories', event.target.value)} /></label>
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
              <button type="button" className="advertising-preview__close">×</button>
              {form.mediaType === 'IMAGE' && form.mediaUrl && <img className="advertising-preview__media" src={form.mediaUrl} alt="" />}
              {form.mediaType === 'VIDEO' && form.mediaUrl && <video className="advertising-preview__media" src={form.mediaUrl} muted loop autoPlay playsInline />}
              <p>{form.message}</p><button type="button" className="advertising-preview__cta">{form.buttonLabel}</button>
            </div>
          </div></div>
          <div className="advertising-studio__notes"><span>Budget {money(form.budget)}</span><span>Up to {form.maxViews || 0} views</span><span>{money(form.costPerView)} / view</span></div>
          <small className="text-muted">Among campaigns with equal targeting relevance, a larger paid campaign budget receives delivery priority.</small>
        </div>
      </div>

      <section className="advertising-campaigns">
        <div className="advertising-studio__section-title"><span>My campaigns</span><small>{campaigns.length} campaigns</small></div>
        <div className="table-responsive"><table className="table align-middle">
          <thead><tr><th>Campaign</th><th>Status</th><th>Views</th><th>Spend</th><th>Remaining</th><th>Control</th></tr></thead>
          <tbody>{campaigns.map((campaign) => <tr key={campaign.id}>
            <td><strong>{campaign.headline}</strong><small className="d-block text-muted">{campaign.templateId} · {(campaign.deliveryMode || 'ONCE_PER_SESSION').replaceAll('_', ' ').toLowerCase()} · priority {money(campaign.budget)}</small></td>
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
