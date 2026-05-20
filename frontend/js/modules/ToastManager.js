class ToastManager {
  constructor(containerId = 'toast-container') {
    this.container = document.getElementById(containerId);
  }

  show(message, type = 'success') {
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      warning: 'bg-yellow-600',
      info: 'bg-tertiary'
    };
    const icons = {
      success: 'check-circle',
      error: 'alert-circle',
      warning: 'alert-triangle',
      info: 'info'
    };

    toast.className = `${colors[type]} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 font-bold transition-all transform translate-y-0 min-w-[280px]`;
    toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-5 h-5"></i> ${message}`;
    this.container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

window.ToastManager = ToastManager;