// public/js/navbar.js
document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.querySelector('.nav-item.dropdown');
  if (!dropdown) return;

  const toggle = dropdown.querySelector('.profile-toggle');
  toggle.addEventListener('click', e => {
    e.preventDefault();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', e => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
});
// This script handles the dropdown functionality for the profile menu in the navbar.
// It toggles the dropdown when the profile toggle is clicked and closes it when clicking outside the