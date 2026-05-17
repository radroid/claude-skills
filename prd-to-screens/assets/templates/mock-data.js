// prd-to-screens — shared mock data.
// SINGLE source of truth: every screen reads from window.MOCK.
// Adding a new entity? Add it here. Renaming "Sam Chen"? Change once here.
// Cross-screen consistency is half the perceived quality of the mockup set.
//
// Replace this starter with entities derived from your PRD intake.
// Aim for 10-20 rows per list-style entity so tables feel real.

(function () {
  const MOCK = {
    // --- Current user (the "you" the mockups present as signed in) ---
    currentUser: {
      id: 'u_001',
      name: 'Sam Chen',
      email: 'sam@lyriclabs.com',
      avatar: 'SC',
      plan: 'Pro',
      joinedAt: '2024-09-14',
    },

    // --- Example entity: clients ---
    clients: [
      { id: 'c_001', name: 'Acme Co.',         email: 'billing@acme.co',         joinedAt: '2024-10-02', outstanding:  0 },
      { id: 'c_002', name: 'Lyric Labs',       email: 'ap@lyriclabs.com',        joinedAt: '2024-10-11', outstanding: 1200 },
      { id: 'c_003', name: 'Northwind LLC',    email: 'accounts@northwind.io',   joinedAt: '2024-11-01', outstanding:  450 },
      { id: 'c_004', name: 'Globex',           email: 'finance@globex.io',       joinedAt: '2024-11-19', outstanding:  0 },
      { id: 'c_005', name: 'Initech',          email: 'pay@initech.com',         joinedAt: '2025-01-04', outstanding: 2550 },
      { id: 'c_006', name: 'Hooli',            email: 'ap@hooli.xyz',            joinedAt: '2025-02-13', outstanding:  0 },
      { id: 'c_007', name: 'Vehement Capital', email: 'invoices@vehement.fund',  joinedAt: '2025-03-22', outstanding:  3200 },
    ],

    // --- Example entity: invoices ---
    invoices: [
      { id: 1024, clientId: 'c_001', amount:  850,  status: 'paid',     sentAt: '2025-05-15', dueAt: '2025-05-22' },
      { id: 1023, clientId: 'c_002', amount: 1200,  status: 'overdue',  sentAt: '2025-05-01', dueAt: '2025-05-08' },
      { id: 1022, clientId: 'c_003', amount:  450,  status: 'sent',     sentAt: '2025-05-10', dueAt: '2025-05-17' },
      { id: 1021, clientId: 'c_004', amount: 1800,  status: 'paid',     sentAt: '2025-04-28', dueAt: '2025-05-05' },
      { id: 1020, clientId: 'c_005', amount: 2550,  status: 'overdue',  sentAt: '2025-04-22', dueAt: '2025-04-29' },
      { id: 1019, clientId: 'c_002', amount:  900,  status: 'paid',     sentAt: '2025-04-15', dueAt: '2025-04-22' },
      { id: 1018, clientId: 'c_006', amount: 1100,  status: 'paid',     sentAt: '2025-04-10', dueAt: '2025-04-17' },
      { id: 1017, clientId: 'c_007', amount: 3200,  status: 'overdue',  sentAt: '2025-04-01', dueAt: '2025-04-08' },
      { id: 1016, clientId: 'c_001', amount:  600,  status: 'paid',     sentAt: '2025-03-25', dueAt: '2025-04-01' },
      { id: 1015, clientId: 'c_003', amount:  750,  status: 'paid',     sentAt: '2025-03-18', dueAt: '2025-03-25' },
    ],

    // --- Helpers consumed across screens ---
    helpers: {
      formatMoney(amount) {
        const v = typeof amount === 'number' ? amount : 0;
        return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      },
      formatDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },
      daysAgo(iso) {
        const d = new Date(iso);
        const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
        if (diff <= 0) return 'today';
        if (diff === 1) return '1d ago';
        return `${diff}d ago`;
      },
      clientName(clientId) {
        const c = MOCK.clients.find(x => x.id === clientId);
        return c ? c.name : '—';
      },
    },

    // --- Quick KPIs used on dashboard, derived from invoices ---
    get kpis() {
      const outstanding = MOCK.invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
      const paid        = MOCK.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
      const overdue     = MOCK.invoices.filter(i => i.status === 'overdue').length;
      return { outstanding, paid, overdue };
    },
  };

  // Empty-state hook: any screen can render its empty variant by appending ?empty=1
  // to the URL. The page script can read MOCK.isEmpty and short-circuit data render.
  const params = new URLSearchParams(window.location.search);
  MOCK.isEmpty = params.get('empty') === '1';

  window.MOCK = MOCK;
})();
