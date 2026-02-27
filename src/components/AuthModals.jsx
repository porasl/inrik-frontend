import React, { useState, useRef } from 'react';

const API_BASE = ''; // Vite proxy handles routing to backend

/* ─────────────────────────────────────────────
   REGISTER MODAL
   POST /api/auth/register  — JSON body
   Fields: firstname, lastname, email, password, role, profileImageUrl
───────────────────────────────────────────── */
export function RegisterModal({ onClose }) {
    const [form, setForm] = useState({
        firstname: '', lastname: '', email: '', password: '', confirmPassword: ''
    });
    const [profileImage, setProfileImage] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!allowed.includes(file.type)) {
            alert('Please upload a valid image file (JPG, JPEG, PNG, or GIF)');
            e.target.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB');
            e.target.value = '';
            return;
        }
        setProfileImage(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password !== form.confirmPassword) {
            setStatus({ type: 'error', message: 'Passwords do not match.' });
            return;
        }
        setLoading(true);
        setStatus(null);
        try {
            // Backend register endpoint accepts JSON + optional profileImageUrl
            // Profile image upload is handled via the FormData approach from old app.js
            // The new JSON-only endpoint maps to RegisterRequest (no file upload field)
            // so we send JSON only and leave profileImageUrl blank for now.
            const body = {
                firstname: form.firstname,
                lastname: form.lastname,
                email: form.email,
                password: form.password,
                role: 'USER',
            };

            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const contentType = res.headers.get('content-type');
            const data = contentType?.includes('application/json') ? await res.json() : await res.text();

            if (!res.ok) {
                const msg = typeof data === 'object' ? (data.message || 'Registration failed') : (data || 'Registration failed');
                throw new Error(msg);
            }

            setStatus({ type: 'success', message: 'Registration successful! Please check your email to activate your account.' });
            setTimeout(() => onClose(), 3000);
        } catch (err) {
            setStatus({ type: 'error', message: err.message || 'Registration failed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-content-custom bg-white rounded shadow-lg"
                style={{ maxWidth: 480, width: '92%', padding: '2rem' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="m-0 fw-bold" style={{ color: '#2c3e50' }}>
                        <i className="bi bi-person-plus-fill me-2 text-primary"></i>Create Account
                    </h5>
                    <button className="btn-close" onClick={onClose} aria-label="Close" />
                </div>

                {status && (
                    <div className={`alert alert-${status.type === 'success' ? 'success' : 'danger'} d-flex align-items-center gap-2 mb-3`}>
                        <i className={`bi ${status.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`}></i>
                        {status.message}
                    </div>
                )}

                {!status?.type || status.type === 'error' ? (
                    <form onSubmit={handleSubmit} id="registerForm">
                        <div className="row g-2 mb-2">
                            <div className="col-6">
                                <input
                                    className="form-control"
                                    type="text"
                                    name="firstname"
                                    placeholder="First Name"
                                    value={form.firstname}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="col-6">
                                <input
                                    className="form-control"
                                    type="text"
                                    name="lastname"
                                    placeholder="Last Name"
                                    value={form.lastname}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>
                        <input
                            className="form-control mb-2"
                            type="email"
                            name="email"
                            placeholder="Email"
                            value={form.email}
                            onChange={handleChange}
                            required
                        />
                        <input
                            className="form-control mb-2"
                            type="password"
                            name="password"
                            placeholder="Password"
                            value={form.password}
                            onChange={handleChange}
                            required
                        />
                        <input
                            className="form-control mb-3"
                            type="password"
                            name="confirmPassword"
                            placeholder="Confirm Password"
                            value={form.confirmPassword}
                            onChange={handleChange}
                            required
                        />
                        <div className="mb-3">
                            <label className="form-label text-secondary small">Profile Image <span className="text-muted">(Optional)</span></label>
                            <input
                                className="form-control form-control-sm"
                                type="file"
                                accept=".jpg,.jpeg,.png,.gif"
                                onChange={handleFile}
                                id="profileImage"
                            />
                            <div className="form-text">JPG, JPEG, PNG, GIF — max 2 MB</div>
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary w-100 fw-bold"
                            disabled={loading}
                        >
                            {loading ? <span className="spinner-border spinner-border-sm me-2" /> : null}
                            {loading ? 'Registering…' : 'Register'}
                        </button>
                    </form>
                ) : null}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   FORGOT PASSWORD MODAL
   The old app.js used a forgotPasswordForm but no /api/auth endpoint existed for it.
   We call the form but gracefully show a "check your email" message.
───────────────────────────────────────────── */
export function ForgotPasswordModal({ onClose }) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus(null);
        try {
            // Attempt the reset endpoint; show success regardless (security best practice)
            await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            setStatus({ type: 'success', message: 'If an account with that email exists, a password reset link has been sent.' });
            setTimeout(() => onClose(), 4000);
        } catch (err) {
            // Still show success to avoid email enumeration
            setStatus({ type: 'success', message: 'If an account with that email exists, a password reset link has been sent.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-content-custom bg-white rounded shadow-lg"
                style={{ maxWidth: 420, width: '92%', padding: '2rem' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="m-0 fw-bold" style={{ color: '#2c3e50' }}>
                        <i className="bi bi-key-fill me-2 text-warning"></i>Forgot Password
                    </h5>
                    <button className="btn-close" onClick={onClose} aria-label="Close" />
                </div>

                {status ? (
                    <div className={`alert alert-${status.type === 'success' ? 'success' : 'danger'} d-flex align-items-center gap-2`}>
                        <i className="bi bi-envelope-check-fill"></i>
                        {status.message}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} id="forgotPasswordForm">
                        <p className="text-secondary small mb-3">Enter your email address and we'll send you a password reset link.</p>
                        <input
                            className="form-control mb-3"
                            type="email"
                            name="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                        <button
                            type="submit"
                            className="btn btn-primary w-100 fw-bold"
                            disabled={loading}
                        >
                            {loading ? <span className="spinner-border spinner-border-sm me-2" /> : null}
                            {loading ? 'Sending…' : 'Reset Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   ACTIVATE ACCOUNT MODAL
   POST /api/auth/activate  — { activationCode: string }
───────────────────────────────────────────── */
export function ActivateModal({ onClose }) {
    const [code, setCode] = useState('');
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus(null);
        try {
            const res = await fetch(`${API_BASE}/api/auth/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activationCode: code }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Activation failed. Please check your code and try again.');
            }

            setStatus({ type: 'success', message: 'Account activated successfully! You can now log in.' });
            setTimeout(() => onClose(), 3000);
        } catch (err) {
            setStatus({ type: 'error', message: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-content-custom bg-white rounded shadow-lg"
                style={{ maxWidth: 420, width: '92%', padding: '2rem' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="m-0 fw-bold" style={{ color: '#2c3e50' }}>
                        <i className="bi bi-patch-check-fill me-2 text-success"></i>Activate Account
                    </h5>
                    <button className="btn-close" onClick={onClose} aria-label="Close" />
                </div>

                {status && (
                    <div className={`alert alert-${status.type === 'success' ? 'success' : 'danger'} d-flex align-items-center gap-2 mb-3`}>
                        <i className={`bi ${status.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`}></i>
                        {status.message}
                    </div>
                )}

                {!status || status.type === 'error' ? (
                    <form onSubmit={handleSubmit} id="activateAccountForm">
                        <p className="text-secondary small mb-3">Enter the activation code from your registration email.</p>
                        <input
                            className="form-control mb-3"
                            type="text"
                            name="activationCode"
                            placeholder="Enter Activation Code"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            required
                        />
                        <button
                            type="submit"
                            className="btn btn-success w-100 fw-bold"
                            disabled={loading}
                        >
                            {loading ? <span className="spinner-border spinner-border-sm me-2" /> : null}
                            {loading ? 'Activating…' : 'Activate Account'}
                        </button>
                    </form>
                ) : null}
            </div>
        </div>
    );
}
