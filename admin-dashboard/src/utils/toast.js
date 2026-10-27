import Swal from 'sweetalert2';

const TOAST_ICONS = {
  success: `<div class="toast-icon-badge toast-icon-success">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  </div>`,
  error: `<div class="toast-icon-badge toast-icon-error">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  </div>`,
  warning: `<div class="toast-icon-badge toast-icon-warning">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  </div>`,
  info: `<div class="toast-icon-badge toast-icon-info">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  </div>`
};

const DELETE_ICON_HTML = `<div class="modal-icon-badge modal-icon-danger">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
</div>`;

// Modern Premium Glassmorphic Toast Notification
export const showToast = (title, text = '', icon = 'success') => {
  Swal.fire({
    toast: true,
    position: 'top-end',
    iconHtml: TOAST_ICONS[icon] || TOAST_ICONS.info,
    title: title,
    text: text,
    showConfirmButton: false,
    timer: 2400,
    timerProgressBar: true,
    customClass: {
      popup: 'premium-toast-popup',
      title: 'premium-toast-title',
      htmlContainer: 'premium-toast-text',
      timerProgressBar: 'premium-toast-bar',
      icon: 'premium-toast-icon-wrapper',
    },
  });
};

// Ultra-Modern Confirmation Modal for Destructive Actions (Delete)
export const showConfirmDelete = async (title = 'Delete Item?', text = 'Are you sure you want to delete this item? This action cannot be undone.') => {
  const result = await Swal.fire({
    title: title,
    text: text,
    iconHtml: DELETE_ICON_HTML,
    showCancelButton: true,
    confirmButtonText: 'Yes, Delete',
    cancelButtonText: 'Cancel',
    buttonsStyling: false,
    customClass: {
      popup: 'premium-delete-modal',
      title: 'premium-modal-title',
      htmlContainer: 'premium-modal-text',
      confirmButton: 'premium-confirm-btn',
      cancelButton: 'premium-cancel-btn',
      actions: 'premium-modal-actions',
      icon: 'premium-modal-icon-wrapper',
    },
    reverseButtons: true,
  });

  return result.isConfirmed;
};

const LOGOUT_ICON_HTML = `<div class="modal-icon-badge" style="background: rgba(239, 68, 68, 0.1); color: #EF4444; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
</div>`;

// Ultra-Modern Confirmation Modal for Sign Out
export const showConfirmLogout = async (title = 'Sign Out?', text = 'Are you sure you want to sign out of SubAi Admin Portal?') => {
  const result = await Swal.fire({
    title: title,
    text: text,
    iconHtml: LOGOUT_ICON_HTML,
    showCancelButton: true,
    confirmButtonText: 'Yes, Sign Out',
    cancelButtonText: 'Stay Signed In',
    buttonsStyling: false,
    customClass: {
      popup: 'premium-delete-modal',
      title: 'premium-modal-title',
      htmlContainer: 'premium-modal-text',
      confirmButton: 'premium-confirm-btn',
      cancelButton: 'premium-cancel-btn',
      actions: 'premium-modal-actions',
      icon: 'premium-modal-icon-wrapper',
    },
    reverseButtons: true,
  });

  return result.isConfirmed;
};

