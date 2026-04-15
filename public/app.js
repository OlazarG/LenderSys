const API_URL = '/api';

// Auth State
let authToken = localStorage.getItem('token') || null;

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.querySelector('#form-login button');
    const errorEl = document.getElementById('login-error');
    btn.disabled = true;
    errorEl.classList.add('hidden');

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas');

        authToken = data.token;
        localStorage.setItem('token', authToken);
        localStorage.setItem('username', data.username);

        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';

        checkAuthAndInit();
    } catch (err) {
        errorEl.innerText = err.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
}

function handleLogout() {
    authToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    state = { clients: [], loans: [], installments: [], currentExpedienteId: null };
    document.getElementById('app-container').classList.add('hidden-view');
    document.getElementById('login-container').classList.remove('hidden');
}

async function handleChangePassword(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const msgEl = document.getElementById('change-password-message');

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;

    if (newPassword !== confirmNewPassword) {
        msgEl.innerText = 'Las nuevas contraseñas no coinciden';
        msgEl.className = 'text-danger text-sm font-semibold text-center py-2';
        msgEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    msgEl.classList.add('hidden');

    try {
        const res = await authFetch(`${API_URL}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar la contraseña');

        msgEl.innerText = 'Contraseña cambiada con éxito';
        msgEl.className = 'text-success text-sm font-semibold text-center py-2';
        msgEl.classList.remove('hidden');
        e.target.reset();
    } catch (err) {
        msgEl.innerText = err.message;
        msgEl.className = 'text-danger text-sm font-semibold text-center py-2';
        msgEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
}

// Custom authenticated fetch wrapper
async function authFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        handleLogout();
        throw new Error('Sesión no autorizada o expirada.');
    }
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor (${res.status})`);
    }
    return res;
}

// State global
let state = { clients: [], loans: [], installments: [], currentExpedienteId: null, lastDashData: null };

let chartInstance = null;
let calendarInstance = null;
let currentLoanFilter = null;
let currentView = 'dashboard';

// Utilities
const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0
    }).format(Math.round(amount || 0));
};

const parseMoney = (str) => {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseFloat(str.toString().replace(/\./g, '')) || 0;
};

const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const split = dateStr.slice(0, 10).split('-');
    if (split.length < 3) return dateStr;
    return `${split[2]}/${split[1]}/${split[0]}`; // DD/MM/YYYY
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndInit();
});

function checkAuthAndInit() {
    if (authToken) {
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden-view');

        const username = localStorage.getItem('username');
        if (document.getElementById('current-username')) {
            document.getElementById('current-username').innerText = username || 'Administrador';
        }

        const dateInput = document.getElementById('start-date-input');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        // Inicializar selectores de tabla al mes actual
        const now = new Date();
        const monthSelect = document.getElementById('table-month');
        const yearSelect = document.getElementById('table-year');
        if (monthSelect) monthSelect.value = now.getMonth();
        if (yearSelect) yearSelect.value = now.getFullYear();

        const loanInputs = ['principal', 'interest_rate', 'installments_count'];
        loanInputs.forEach(id => {
            const el = document.querySelector(`#form-prestamo [name="${id}"]`);
            if (el) el.addEventListener('input', updateLoanCalculations);
        });

        // Separador de miles en vivo para el capital
        const principalInput = document.querySelector('#form-prestamo [name="principal"]');
        if (principalInput) {
            principalInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, "");
                if (value) {
                    e.target.value = new Intl.NumberFormat('es-PY').format(value);
                }
            });
        }

        // Separadores para modal edición (nueva funcionalidad)
        ['edit-inst-original', 'edit-inst-carried', 'edit-inst-paid', 'edit-inst-overpaid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    let value = e.target.value.replace(/\D/g, "");
                    if (value) { e.target.value = new Intl.NumberFormat('es-PY').format(value); }
                });
            }
        });

        fetchData();
    } else {
        document.getElementById('app-container').classList.add('hidden-view');
        document.getElementById('login-container').classList.remove('hidden');
    }
}

function updateLoanCalculations() {
    const form = document.getElementById('form-prestamo');
    const principal = parseMoney(form.querySelector('[name="principal"]').value);
    const interestRate = parseFloat(form.querySelector('[name="interest_rate"]').value) || 0;
    const count = parseInt(form.querySelector('[name="installments_count"]').value) || 0;

    if (principal > 0 && count > 0) {
        const totalInterest = principal * (interestRate / 100);
        const totalAmount = principal + totalInterest;
        const installmentAmount = totalAmount / count;
        document.getElementById('calc-installment').innerText = formatMoney(installmentAmount);
        document.getElementById('calc-total').innerText = formatMoney(totalAmount);
    } else {
        document.getElementById('calc-installment').innerText = '₲ 0';
        document.getElementById('calc-total').innerText = '₲ 0';
    }
}

function switchView(viewName, btnObj, preserveFilter = false) {
    currentView = viewName;
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden-view'));
    document.querySelectorAll('.nav-btn:not(.bottom-btn)').forEach(el => el.classList.remove('nav-item-active'));
    document.querySelectorAll('.bottom-btn').forEach(el => el.classList.remove('bottom-nav-active'));

    if (!preserveFilter) {
        currentLoanFilter = null;
    }

    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden-view');

    if (btnObj) {
        if (btnObj.classList.contains('bottom-btn')) btnObj.classList.add('bottom-nav-active');
        else btnObj.classList.add('nav-item-active');
    }

    if (viewName === 'calendario') {
        renderCalendar();
        renderPaymentsTable();
    } else if (viewName === 'clientes') {
        renderClientsList();
    } else if (viewName === 'prestamos') {
        renderLoansList();
    } else if (viewName === 'dashboard') {
        renderDashboard();
    }
}

async function fetchData() {
    try {
        const [resCustomers, resLoans, resInst, resDash] = await Promise.all([
            authFetch(`${API_URL}/customers`).then(r => r.json()),
            authFetch(`${API_URL}/loans`).then(r => r.json()),
            authFetch(`${API_URL}/installments`).then(r => r.json()),
            authFetch(`${API_URL}/dashboard`).then(r => r.json())
        ]);

        state.clients = resCustomers || [];
        state.loans = resLoans || [];
        state.installments = resInst || [];

        renderClientsList();
        renderLoansList();
        renderDashboard(resDash);
        state.lastDashData = resDash;
        renderCalendar();
        renderPaymentsTable();

        // Si el expediente estaba abierto, refrescarlo sin cerrarlo
        if (state.currentExpedienteId) {
            const clientExists = state.clients.some(c => c.id === state.currentExpedienteId);
            const modalVisible = !document.getElementById('modal-expediente').classList.contains('hidden');
            
            if (clientExists && modalVisible) {
                renderExpedienteUI(state.currentExpedienteId);
            } else if (!clientExists) {
                state.currentExpedienteId = null;
                closeModal('modal-expediente');
            }
        }

        const selectClient = document.getElementById('select-client');
        if (selectClient) {
            selectClient.innerHTML = '<option value="" disabled selected>Seleccionar Cliente</option>';
            state.clients.forEach(c => {
                selectClient.innerHTML += `<option value="${c.id}">${c.full_name}</option>`;
            });
        }
    } catch (err) {
        console.error('Error fetching data:', err);
    }
}

function renderDashboard(data) {
    if (!data) data = state.lastDashData || {};
    const kpis = {
        'dash-prestado': data.total_prestado,
        'dash-recuperado': data.total_recuperado,
        'dash-mora': data.total_mora,
        'dash-a-recuperar': data.total_a_recuperar
    };
    // Nota: El HTML original puede que no tenga todos estos IDs, pero los mapeamos por si acaso
    Object.keys(kpis).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = formatMoney(kpis[id] || 0);
    });

    const todayStr = new Date().toISOString().split('T')[0];
    let hoyCount = 0, pendCount = 0, vencCount = 0, hoyEsperado = 0;
    let upcoming = [];

    state.installments.forEach(inst => {
        if (inst.status !== 'PAGADO' && inst.status !== 'TRANSFERIDO') {
            const isLate = inst.due_date < todayStr;
            if (isLate) vencCount++;
            else if (inst.due_date === todayStr) {
                hoyCount++;
                hoyEsperado += parseFloat(inst.total_due);
            } else {
                pendCount++;
            }
            upcoming.push(inst);
        }
    });

    const term = document.getElementById('search-dashboard')?.value.toLowerCase() || '';
    let filteredUpcoming = upcoming;
    if (term) {
        filteredUpcoming = upcoming.filter(i => 
            i.client_name.toLowerCase().includes(term) || 
            i.loan_id.slice(0, 8).toLowerCase().includes(term)
        );
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setVal('dash-hoy-esperado', formatMoney(hoyEsperado));
    setVal('dash-hoy-count', hoyCount);
    setVal('dash-pend-count', pendCount);
    setVal('dash-venc-count', vencCount);

    filteredUpcoming.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const mList = document.getElementById('list-upcoming');
    if (mList) {
        mList.innerHTML = '';
        if (filteredUpcoming.length === 0) {
            mList.innerHTML = '<li class="py-2 text-sm text-gray-500">No se encontraron pagos próximos.</li>';
        } else {
            filteredUpcoming.slice(0, 5).forEach(inst => {
                const isLate = inst.due_date < todayStr;
                let color = isLate ? 'text-danger' : 'text-primary';
                mList.innerHTML += `
                    <li class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onclick="openPaymentModal('${inst.id}', '${inst.loan_id}', '${inst.client_name}', ${inst.total_due})">
                        <div>
                            <p class="font-semibold text-gray-800 text-sm">${inst.client_name}</p>
                            <p class="text-xs text-gray-500">${formatDate(inst.due_date)} • Cuota #${inst.installment_number}</p>
                        </div>
                        <span class="${color} font-bold text-sm bg-white px-2 py-1 shadow-sm rounded">${formatMoney(inst.total_due)}</span>
                    </li>
                `;
            });
        }
    }
    renderChart();
}

function renderChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const revenues = { 'Jan': 0, 'Feb': 0, 'Mar': 0, 'Apr': 0, 'May': 0, 'Jun': 0, 'Jul': 0, 'Aug': 0, 'Sep': 0, 'Oct': 0, 'Nov': 0, 'Dec': 0 };
    const monthNames = Object.keys(revenues);
    state.installments.forEach(inst => {
        const d = new Date(inst.due_date);
        const m = d.getMonth();
        if (m >= 0 && m < 12) revenues[monthNames[m]] += parseFloat(inst.total_due);
    });
    const dataArr = monthNames.map(m => revenues[m]);
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthNames,
            datasets: [{
                label: 'Pagos Esperados (₲)',
                data: dataArr,
                borderColor: '#FF6C40',
                backgroundColor: 'rgba(255, 108, 64, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#FF6C40',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } }
            }
        }
    });
}

function renderClientsList() {
    const searchEl = document.getElementById('search-client');
    const term = searchEl ? searchEl.value.toLowerCase() : '';
    const container = document.getElementById('clients-list');
    if (!container) return;
    container.innerHTML = '';
    const filtered = state.clients.filter(c => c.full_name.toLowerCase().includes(term));
    if (filtered.length === 0) {
        container.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">No se encontraron clientes.</td></tr>';
        return;
    }
    filtered.forEach(c => {
        container.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors cursor-pointer" onclick="openExpedienteModal('${c.id}')">
                <td class="px-6 py-4">
                    <div class="font-medium text-gray-800">${c.full_name}</div>
                    <div class="text-[10px] text-gray-400">ID: ${c.id.slice(0, 8)}</div>
                </td>
                <td class="px-6 py-4 text-gray-600">${c.phone || '-'}</td>
                <td class="px-6 py-4 text-gray-600">Normal</td>
                <td class="px-6 py-4 text-gray-400 text-xs italic">-</td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/20">Activo</span>
                </td>
                <td class="px-6 py-4 text-center" onclick="event.stopPropagation()">
                    <div class="flex justify-center gap-3">
                        <button onclick="openExpedienteModal('${c.id}')" 
                            class="text-primary hover:text-orange-600 font-bold text-xs uppercase tracking-wider title="Ver Expediente"">
                            <i class="fas fa-file-invoice"></i> Expediente
                        </button>
                        <button onclick="openClientModal('${c.id}')" class="text-blue-500 hover:text-blue-700" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteClient('${c.id}')" class="text-red-500 hover:text-red-700" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderLoansList() {
    const container = document.getElementById('loans-list');
    if (!container) return;
    container.innerHTML = '';
    if (state.loans.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">No hay préstamos registrados</p>';
        return;
    }

    const term = document.getElementById('search-loans')?.value.toLowerCase() || '';
    const filtered = state.loans.filter(l => {
        const client = state.clients.find(c => c.id === l.customer_id);
        const name = client ? client.full_name.toLowerCase() : '';
        return name.includes(term) || l.id.slice(0, 8).toLowerCase().includes(term);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">No se encontraron préstamos.</p>';
        return;
    }

    filtered.forEach(l => {
        const client = state.clients.find(c => c.id === l.customer_id);
        const clientName = client ? client.full_name : 'Desconocido';

        // Calcular cuotas resumen (incluyendo cuotas extendidas)
        const loanInsts = state.installments.filter(inst => inst.loan_id === l.id);
        const totalActualInstallments = loanInsts.length; // Total actual incluyendo extendidas
        const pagadas = loanInsts.filter(i => i.status === 'PAGADO').length;
        const pendientes = loanInsts.filter(i => i.status === 'PENDIENTE' || i.status === 'ATRASADO').length;
        const isExtended = loanInsts.some(i => i.installment_number > l.total_installments);

        let badgeColor = 'bg-primary light text-white';
        let statusText = l.status;

        if (l.status === 'FINALIZADO') {
            badgeColor = 'bg-success text-white';
        } else if (l.status === 'MOROSO') {
            badgeColor = 'bg-danger text-white';
        } else if (isExtended) {
            badgeColor = 'bg-amber-500 text-white';
            statusText = 'EXTENDIDO';
        }

        container.innerHTML += `
            <div class="bg-white border border-gray-200 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer" onclick="filterCalendarByLoan('${l.id}')">
                <div class="absolute top-0 right-0 ${badgeColor} text-[10px] font-bold px-3 py-1 rounded-bl-lg">${statusText}</div>
                <div class="mb-4">
                    <h4 class="font-bold text-gray-800 text-lg">${clientName}</h4>
                    <p class="text-xs text-gray-400">Ref #${l.id.slice(0, 8)} • ${l.frequency}</p>
                    <button onclick="event.stopPropagation(); openExpedienteModal('${l.customer_id}')" class="mt-2 text-xs font-bold text-primary hover:text-orange-700 hover:underline inline-flex items-center gap-1">Ver Expediente <i class="fas fa-arrow-right text-[10px]"></i></button>
                </div>
                <div class="grid grid-cols-2 gap-y-4 gap-x-2 text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div>
                        <p class="text-xs text-gray-500 mb-1">Monto Capital</p>
                        <p class="font-bold text-gray-800">${formatMoney(l.amount)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 mb-1">Interés</p>
                        <p class="font-bold text-primary">${l.interest_rate}%</p>
                    </div>
                    <div class="col-span-2 flex justify-between items-center border-t border-gray-200 pt-2 mt-1">
                        <div>
                            <p class="text-[10px] text-gray-400 uppercase font-bold">Cuotas</p>
                            <p class="text-xs font-semibold">
                                <span class="text-success">${pagadas}</span> / <span class="text-gray-600">${totalActualInstallments}</span>
                            </p>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] text-gray-400 uppercase font-bold">Creado</p>
                            <p class="text-xs text-gray-600">${formatDate(l.created_at)}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    let items = state.installments;

    // UI Filter info
    const filterInfo = document.getElementById('calendar-filter-info');
    if (filterInfo) {
        if (currentLoanFilter) {
            const loan = state.loans.find(l => l.id === currentLoanFilter);
            const client = loan ? state.clients.find(c => c.id === loan.customer_id) : null;
            document.getElementById('filtered-loan-id').innerText = `#${currentLoanFilter.slice(0, 8)}`;
            document.getElementById('filtered-client-name').innerText = client ? client.full_name : 'Desconocido';
            filterInfo.classList.remove('hidden');
        } else {
            filterInfo.classList.add('hidden');
        }
    }

    if (currentLoanFilter) items = items.filter(inst => inst.loan_id === currentLoanFilter);

    const events = items.map(inst => {
        const isPaid = inst.status === 'PAGADO';
        const isTransferred = inst.status === 'TRANSFERIDO';
        const color = isPaid ? '#1BC5BD' : (isTransferred ? '#94a3b8' : '#F64E60');

        // Normalizar fecha a YYYY-MM-DD para evitar problemas de zona horaria
        const dateOnly = inst.due_date.split('T')[0];

        return {
            id: inst.id,
            title: `${inst.client_name} | ${formatMoney(inst.total_due).replace('₲', '').trim()}`,
            start: dateOnly,
            allDay: true,
            backgroundColor: isPaid ? 'rgba(27, 197, 189, 0.1)' : 'rgba(246, 78, 96, 0.1)',
            borderColor: isPaid ? 'rgba(27, 197, 189, 0.2)' : 'rgba(246, 78, 96, 0.2)',
            textColor: color,
            extendedProps: { ...inst }
        };
    });

    console.log(`Rendering ${events.length} events in calendar`);

    if (!calendarInstance) {
        calendarInstance = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'es',
            firstDay: 1,
            dayMaxEvents: false, // Mostrar todos los eventos sin ocultar bajo "+ más"
            eventOrder: 'title',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' },
            events: events,
            displayEventTime: false,
            eventClick: info => {
                const props = info.event.extendedProps;
                if (props.status === 'PENDIENTE' || props.status === 'ATRASADO') {
                    const remaining = parseFloat(props.total_due) - parseFloat(props.paid_amount || 0);
                    if (remaining >= 1) {
                        openPaymentModal(props.id, props.loan_id, props.client_name, remaining);
                    }
                }
            },
            datesSet: info => {
                const start = info.view.currentStart;
                document.getElementById('table-month').value = start.getMonth();
                document.getElementById('table-year').value = start.getFullYear();
                renderPaymentsTable();
            }
        });
        calendarInstance.render();
    } else {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(events);
        // Forzar recalculo de tamaño por si estaba oculto
        setTimeout(() => calendarInstance.updateSize(), 50);
    }
}

function syncCalendarAndTable() {
    const monthVal = document.getElementById('table-month').value;
    const yearVal = document.getElementById('table-year').value;

    if (monthVal !== 'todos' && calendarInstance) {
        const d = new Date(parseInt(yearVal), parseInt(monthVal), 1);
        calendarInstance.gotoDate(d);
    }
    renderPaymentsTable();
}

function renderPaymentsTable() {
    const container = document.getElementById('payments-table-body');
    const searchEl = document.getElementById('search-payments');
    const term = searchEl ? searchEl.value.toLowerCase() : '';
    if (!container) return;

    let items = state.installments;

    // Filtro por mes/año seleccionado
    const monthVal = document.getElementById('table-month').value;
    const selectedYear = parseInt(document.getElementById('table-year').value);

    items = items.filter(inst => {
        if (monthVal === 'todos') return true;
        const d = new Date(inst.due_date);
        return d.getMonth() === parseInt(monthVal) && d.getFullYear() === selectedYear;
    });

    if (currentLoanFilter) items = items.filter(inst => inst.loan_id === currentLoanFilter);
    if (term) items = items.filter(inst => inst.client_name.toLowerCase().includes(term));

    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" class="py-12 bg-white text-center">
                    <div class="flex flex-col items-center">
                        <span class="text-4xl mb-3 opacity-20">📁</span>
                        <p class="text-gray-400 font-medium">No se encontraron cobros registrados</p>
                        <p class="text-[10px] text-gray-400 mt-1">Intenta ajustando el filtro o el buscador</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    items.forEach(inst => {
        const isPaid = inst.status === 'PAGADO';
        const isTransferred = inst.status === 'TRANSFERIDO';
        const statusClass = isPaid ? 'bg-success/10 text-success border-success/20' :
            (isTransferred ? 'bg-gray-100 text-gray-500' : 'bg-danger/10 text-danger border-danger/20');

        container.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                <td class="px-6 py-4">
                    <div class="font-bold text-gray-800">${inst.client_name}</div>
                    <div class="text-[10px] text-gray-400">Cuota #${inst.installment_number}</div>
                </td>
                <td class="px-6 py-4 text-gray-600 font-medium">${formatMoney(inst.monto_prestamo || 0)}</td>
                <td class="px-6 py-4 text-primary font-bold italic">${formatMoney(inst.total_due)}</td>
                <td class="px-6 py-4">
                    <div class="text-gray-800 font-medium">${formatDate(inst.due_date)}</div>
                    <div class="text-[10px] text-gray-400">Frecuencia: ${inst.frecuencia || '-'}</div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-bold border ${statusClass}">${inst.status}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="openExpedienteModal('${inst.customer_id}')" 
                            class="text-xs bg-gray-100 hover:bg-[#1E1E2D] hover:text-white px-3 py-1.5 rounded-lg transition-all font-medium border border-gray-200">Ver Perfil</button>
                        ${(inst.status === 'PENDIENTE' || inst.status === 'ATRASADO') && (parseFloat(inst.total_due) - parseFloat(inst.paid_amount || 0)) >= 1 ? `<button onclick="openPaymentModal('${inst.id}', '${inst.loan_id}', '${inst.client_name}', ${parseFloat(inst.total_due) - parseFloat(inst.paid_amount || 0)})" 
                            class="text-xs bg-primary text-white hover:bg-orange-600 px-3 py-1.5 rounded-lg transition-all font-bold shadow-sm">Cobrar</button>` : ''}
                        <button onclick="openPaymentModal('${inst.id}', '${inst.loan_id}', '${inst.client_name}', ${inst.paid_amount || 0}, true)" 
                            class="text-xs bg-gray-700 text-white hover:bg-gray-900 px-2 py-1.5 rounded-lg transition-all font-bold opacity-70 hover:opacity-100" title="Corregir Cuota">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function filterCalendarByLoan(loanId) {
    currentLoanFilter = loanId;
    
    // Encontrar la fecha de la primera cuota para este préstamo
    const loanInsts = state.installments.filter(inst => inst.loan_id === loanId);
    let targetDate = null;
    if (loanInsts.length > 0) {
        // Ordenar por fecha para asegurar que sea la primera
        loanInsts.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        targetDate = loanInsts[0].due_date;
    }

    switchView('calendario', document.querySelector('[onclick*="calendario"]'), true);
    renderCalendar();

    // Si encontramos una cuota, mover el calendario a ese mes
    if (targetDate && calendarInstance) {
        calendarInstance.gotoDate(targetDate);
        // FullCalendar disparará datesSet, que sincroniza los selectores y la tabla
    }

    renderPaymentsTable();
}

function clearLoanFilter() {
    currentLoanFilter = null;
    renderCalendar();
    renderPaymentsTable();
}

function setFullPayment() {
    const restante = document.getElementById('pago-restante').innerText;
    document.getElementById('pago-amount').value = restante;
}

async function openExpedienteModal(clientId) {
    state.currentExpedienteId = clientId;
    openModal('modal-expediente');
    renderExpedienteUI(clientId);
}

async function renderExpedienteUI(clientId) {
    try {
        const res = await authFetch(`${API_URL}/customers/${clientId}/expediente`);
        const data = await res.json();
        const { customer, loans, installments, is_moroso } = data;

        if (!customer) {
            throw new Error("No se encontró información del cliente.");
        }

        document.getElementById('exp-client-name').innerText = `Expediente: ${customer.full_name}`;
        document.getElementById('exp-client-id').innerText = `ID: ${customer.id}`;

        // Resumen
        const totalPrestado = loans.reduce((sum, l) => sum + parseFloat(l.amount), 0);
        const totalRecuperado = installments.reduce((sum, i) => sum + (parseFloat(i.paid_amount || 0) + parseFloat(i.overpaid_amount || 0)), 0);
        const loansCount = loans.length;
        const statusColor = is_moroso ? 'text-danger' : 'text-success';
        const statusText = is_moroso ? 'MOROSO' : 'LIMPIO';

        document.getElementById('exp-summary').innerHTML = `
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Prestado</p>
                <p class="text-lg font-black text-gray-800">${formatMoney(totalPrestado)}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Recuperado</p>
                <p class="text-lg font-black text-success">${formatMoney(totalRecuperado)}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 md:col-span-2 lg:col-span-1 flex flex-row gap-4 items-center justify-between">
                <div>
                    <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Préstamos Totales</p>
                    <p class="text-lg font-black text-gray-800">${loansCount}</p>
                </div>
                <div class="text-right">
                    <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Estado</p>
                    <p class="text-lg font-black ${statusColor}">${statusText}</p>
                </div>
            </div>
        `;

        // Historial de préstamos
        const container = document.getElementById('exp-loans-container');
        container.innerHTML = '';

                loans.forEach(l => {
                    const lInsts = installments.filter(i => i.loan_id === l.id);
                    const totalActualInstallments = lInsts.length; // Total actual incluyendo cuotas extendidas
                    const pagadas = lInsts.filter(i => i.status === 'PAGADO').length;
                    const loanRecuperado = lInsts.reduce((sum, i) => sum + (parseFloat(i.paid_amount || 0) + parseFloat(i.overpaid_amount || 0)), 0);

                    const loanEl = document.createElement('div');
                    loanEl.className = 'bg-white border border-gray-200 rounded-xl overflow-hidden mb-6 last:mb-0';
                    loanEl.innerHTML = `
                <div class="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                    <span class="text-xs font-bold text-gray-500">PRÉSTAMO #${l.id.slice(0, 8)} • ${formatDate(l.created_at)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${l.status === 'FINALIZADO' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}">${l.status}</span>
                </div>
                <div class="p-4">
                    <div class="flex flex-wrap items-center justify-between gap-4 mb-4 bg-gray-50/50 p-3 rounded-xl border border-dashed border-gray-200">
                        <div class="flex gap-8">
                            <div>
                                <p class="text-[10px] text-gray-400 uppercase font-bold">Monto</p>
                                <p class="text-sm font-bold text-gray-800">${formatMoney(l.amount)}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-400 uppercase font-bold">Cuotas</p>
                                <p class="text-sm font-bold text-gray-800">${pagadas} / ${totalActualInstallments}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-400 uppercase font-bold">Frecuencia</p>
                                <p class="text-[11px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10 inline-block mt-0.5">${l.frequency}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-400 uppercase font-bold">Estado</p>
                                <p class="text-[11px] font-black ${l.status === 'FINALIZADO' ? 'text-success bg-success/5 border-success/10' : (l.status === 'MOROSO' ? 'text-danger bg-danger/5 border-danger/10' : 'text-blue-600 bg-blue-50 border-blue-100')} px-2 py-0.5 rounded-lg border inline-block mt-0.5">${l.status}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-400 uppercase font-bold">Total a Pagar</p>
                                <p class="text-sm font-bold text-gray-800">${formatMoney(parseFloat(l.amount) + parseFloat(l.amount * (l.interest_rate / 100)))}</p>
                            </div>
                        </div>
                        <div class="bg-white px-4 py-2 rounded-lg border border-emerald-100 shadow-sm flex flex-col items-end">
                            <p class="text-[9px] text-emerald-500 uppercase font-black tracking-wider">Total Recuperado</p>
                            <p class="text-base font-black text-emerald-600">${formatMoney(loanRecuperado)}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        ${lInsts.map(i => {
                const isPaid = i.status === 'PAGADO';
                const isExtended = i.installment_number > l.total_installments;
                // Usar umbral de 1 para evitar errores de coma flotante
                const isPartial = isPaid && (parseFloat(i.total_due) - parseFloat(i.paid_amount)) >= 1;

                const lastRecNum = lInsts
                    .filter(inst => parseFloat(inst.direct_payment || 0) > 0)
                    .reduce((max, inst) => Math.max(max, inst.installment_number), 0);

                const firstEmptyNum = lInsts
                    .find(inst => inst.status === 'PENDIENTE' && parseFloat(inst.direct_payment || 0) < 1)
                    ?.installment_number || 999;

                let bgColor = 'bg-gray-50 border-gray-200';
                let textColor = 'text-gray-500';
                let dotColor = 'bg-gray-400';

                if (isPaid) {
                    if (isPartial) {
                        bgColor = 'bg-orange-50 border-orange-200';
                        textColor = 'text-orange-700';
                        dotColor = 'bg-orange-400';
                    } else {
                        bgColor = 'bg-emerald-50 border-emerald-200';
                        textColor = 'text-emerald-700';
                        dotColor = 'bg-emerald-400';
                    }
                } else if (isExtended) {
                    bgColor = 'bg-amber-50 border-amber-200';
                    textColor = 'text-amber-700';
                    dotColor = 'bg-amber-400';
                } else if (parseFloat(i.paid_amount || 0) > 0) {
                    bgColor = 'bg-blue-50 border-blue-200';
                    textColor = 'text-blue-700';
                    dotColor = 'bg-blue-400';
                }

                // El Neto es simplemente el total_due, que ya incluye excedentes y deudas arrastradas
                const netTotal = parseFloat(i.total_due);

    const isLatestWithMoney = i.installment_number === lastRecNum;
    const isNextEmpty = i.installment_number === firstEmptyNum;
    const canInteract = isLatestWithMoney || isNextEmpty;
    const isEditMode = isLatestWithMoney;

    return `
        <div onclick="${canInteract ? `openPaymentModal('${i.id}', '${l.id}', '${customer.full_name}', ${isEditMode ? (i.direct_payment || 0) : netTotal}, ${isEditMode})` : ''}"
             class="p-2 border rounded-lg ${bgColor} text-[10px] flex flex-col gap-1 relative ${canInteract ? 'cursor-pointer hover:border-primary/50 hover:bg-white transition-colors' : 'opacity-60 cursor-not-allowed'} group">
            ${isExtended ? `<span class="absolute -top-2 -right-1 bg-amber-500 text-white text-[7px] px-1 rounded font-black shadow-sm">EXT</span>` : ''}

            <div class="flex items-center gap-1.5 font-bold ${textColor}">
                <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                Cuota ${i.installment_number}
            </div>
            <div class="flex justify-between font-medium">
                <span class="text-gray-400">Vence:</span>
                <span class="text-gray-800">${formatDate(i.due_date)}</span>
            </div>
            <div class="flex justify-between font-bold border-t border-gray-100 mt-1 pt-1">
                <span class="text-gray-400">${isPaid ? 'Recibido:' : 'Total a Pagar:'}</span>
                <span class="text-gray-900">${formatMoney(isPaid ? (parseFloat(i.paid_amount || 0) + parseFloat(i.overpaid_amount || 0)) : netTotal)}</span>
            </div>

            ${isPartial ? `<div class="text-[9px] text-orange-600 font-bold border-t border-orange-100 pt-1 mt-1">⚠️ Pagó parcial, restan: ${formatMoney(parseFloat(i.total_due) - parseFloat(i.paid_amount))}</div>` : ''}

            ${(!isPaid && parseFloat(i.paid_amount || 0) > 0) ? `<div class="text-[9px] text-blue-600 font-bold border-t border-blue-100 pt-1 mt-1 flex flex-col gap-0.5"><div class="flex justify-between"><span>Abonado:</span><span>${formatMoney(i.paid_amount)}</span></div><div class="flex justify-between text-orange-600"><span>Resta:</span><span>${formatMoney(netTotal - parseFloat(i.paid_amount))}</span></div></div>` : ''}

            ${parseFloat(i.carried_over_amount || 0) > 0 ? `<div class="text-[9px] text-red-600 font-bold border-t border-red-100 pt-1 mt-1 flex justify-between"><span>⬆️ Deuda Arrastrada:</span><span>+${formatMoney(i.carried_over_amount)}</span></div>` : ''}

            ${parseFloat(i.surplus_applied || 0) > 0 ? `<div class="text-[9px] text-emerald-600 font-bold border-t border-emerald-100 pt-1 mt-1 flex justify-between"><span>✨ Excedente Aplicado:</span><span>-${formatMoney(i.surplus_applied)}</span></div>` : ''}

            ${(isPaid && parseFloat(i.overpaid_amount || 0) > 0) ? `<div class="text-[9px] text-emerald-700 font-bold border-t border-emerald-200 pt-1 mt-1 flex justify-between bg-emerald-100/50 p-1 rounded"><span>💰 Saldo a Favor:</span><span>${formatMoney(i.overpaid_amount)}</span></div>` : ''}
        </div>
    `;
                        }).join('')}
                    </div>
                </div>
            `;
                container.appendChild(loanEl);
            });
        } catch (err) {
            alert("Error cargando expediente: " + err.message);
        }
    }

function openClientModal(clientId = null) {
    const hiddenId = document.getElementById('client-id-hidden');
    const title = document.getElementById('modal-cliente-title');
    const form = document.getElementById('form-cliente');

    form.reset();

    if (clientId) {
        const client = state.clients.find(c => c.id === clientId);
        if (client) {
            hiddenId.value = client.id;
            title.innerText = 'Editar Cliente';
            document.getElementById('client-name').value = client.full_name;
            document.getElementById('client-phone').value = client.phone || '';
        }
    } else {
        hiddenId.value = '';
        title.innerText = 'Nuevo Cliente';
    }

    openModal('modal-cliente');
}

function showConfirm(text, onConfirm) {
    document.getElementById('confirm-text').innerText = text;
    const btn = document.getElementById('confirm-btn');

    // Clonar para limpiar eventos previos
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.onclick = () => {
        onConfirm();
        closeModal('modal-confirm');
    };

    openModal('modal-confirm');
}

async function deleteClient(id) {
    showConfirm("¿Estás seguro de eliminar este cliente? Se eliminarán también todos sus préstamos asociados.", async () => {
        try {
            const res = await authFetch(`${API_URL}/customers/${id}`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            alert("Error al eliminar: " + err.message);
        }
    });
}

function openModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
    if (id === 'modal-prestamo') updateLoanCalculations();
}

function closeModal(id) {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById(id).classList.add('hidden');
    const form = document.querySelector(`#${id} form`);
    if (form) form.reset();

    if (id === 'modal-expediente') {
        state.currentExpedienteId = null;
    }
}

async function submitForm(e, type) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    let endpoint = type === 'cliente' ? '/customers' : (type === 'prestamo' ? '/loans' : '/payments');

    // Mapeo específico para prestamos
    if (type === 'prestamo') {
        data.customer_id = data.client_id;
        data.amount = parseMoney(data.principal);
        data.total_installments = data.installments_count;
    }

    // Mapeo específico para clientes
    if (type === 'cliente') {
        data.full_name = data.name;
        const id = document.getElementById('client-id-hidden').value;
        if (id) {
            endpoint = `/customers/${id}`;
            try {
                await authFetch(`${API_URL}${endpoint}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                closeModal(`modal-${type}`);
                fetchData();
            } catch (err) {
                alert("Error: " + err.message);
            } finally {
                if (btn) btn.disabled = false;
            }
            return;
        }
    }

    // Mapeo específico para pagos
    if (type === 'pago') {
        data.installment_id = data.installment_id;
        data.amount = parseMoney(data.amount);

        // Si es edición, cambiar método y endpoint a PUT /api/installments/:id
        if (form.dataset.mode === 'edit') {
            const id = data.installment_id;
            try {
                // Solo mandamos el nuevo monto directo — el backend recalcula todo
                await authFetch(`${API_URL}/installments/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paid_amount: data.amount })
                });
                closeModal('modal-pago');
                fetchData();
            } catch (err) {
                alert("Error al corregir la cuota: " + err.message);
            } finally {
                if (btn) btn.disabled = false;
            }
            return;
        }
    }

    try {
        await authFetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        closeModal(`modal-${type}`);
        fetchData();
    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openPaymentModal(inst_id, loan_id, client_name, amount, isEdit = false) {
    const elId = document.getElementById('pago-inst-id');
    if (!elId) return;
    elId.value = inst_id;
    document.getElementById('pago-loan-id').value = loan_id;
    document.getElementById('pago-desc').innerText = `Préstamo #${loan_id.slice(0, 8)} - ${client_name}`;
    document.getElementById('modal-pago-title').innerText = isEdit ? 'Corregir Pago' : 'Registrar Pago';
    document.getElementById('form-pago').dataset.mode = isEdit ? 'edit' : 'pago';

    // Formatear monto inicial
    const formattedAmount = new Intl.NumberFormat('es-PY').format(Math.round(amount));
    document.getElementById('pago-amount').value = formattedAmount;

    document.getElementById('pago-restante').innerText = formatMoney(amount).replace('₲', '').trim();

    // Desglose de saldo anterior vs cuota actual
    const inst = state.installments.find(i => i.id === inst_id);
    const desgloseContainer = document.getElementById('pago-desglose-container');
    if (inst && parseFloat(inst.carried_over_amount) > 0) {
        desgloseContainer.classList.remove('hidden');
        document.getElementById('pago-saldo-anterior').innerText = formatMoney(inst.carried_over_amount);
        document.getElementById('pago-cuota-base').innerText = formatMoney(inst.original_amount);
    } else {
        desgloseContainer.classList.add('hidden');
    }

    // Calcular resumen del préstamo
    const loanInsts = state.installments.filter(i => i.loan_id === loan_id);
    const pagadas = loanInsts.filter(i => i.status === 'PAGADO').length;
    const pendientes = loanInsts.filter(i => i.status === 'PENDIENTE' || i.status === 'ATRASADO').length;
    const totalDeuda = loanInsts
        .filter(i => i.status === 'PENDIENTE' || i.status === 'ATRASADO')
        .reduce((sum, i) => sum + parseFloat(i.total_due), 0);

    document.getElementById('pago-cuotas-pagadas').innerText = pagadas;
    document.getElementById('pago-cuotas-pendientes').innerText = pendientes;
    document.getElementById('pago-total-deuda').innerText = formatMoney(totalDeuda);

    openModal('modal-pago');
}

async function updateStatusCron() {
    try {
        const res = await authFetch(`${API_URL}/trigger-accumulation`, { method: 'POST' });
        const data = await res.json();
        alert(data.message);
        fetchData();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function exportData(type) {
    try {
        const res = await authFetch(`${API_URL}/export/${type}`);
        const data = await res.json();

        if (type === 'prestamos') {
            const headers = ['ID', 'Cliente', 'Monto Original', 'Tasa (%)', 'Frecuencia', 'Cuotas Totales', 'Estado', 'Fecha Creación'];

            const rows = data.map(l => {
                const client = state.clients.find(c => c.id === l.customer_id);
                return [
                    l.id.slice(0, 8),
                    client ? client.full_name : 'Desconocido',
                    l.amount,
                    l.interest_rate,
                    l.frequency,
                    l.total_installments,
                    l.status,
                    formatDate(l.created_at)
                ].map(val => `"${val}"`).join(';');
            });

            const csvContent = "\uFEFF" + headers.join(';') + "\n" + rows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Prestamos_${new Date().toLocaleDateString('es-PY').replace(/\//g, '-')}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    } catch (err) {
        alert("Error al exportar los datos");
    }
}

