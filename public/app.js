const API_URL = '/api';

// State global
let state = {
    clients: [],
    loans: [],
    installments: []
};

let chartInstance = null;
let calendarInstance = null;
let currentLoanFilter = null;

// Utilities
const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-PY', { 
        style: 'currency', 
        currency: 'PYG',
        maximumFractionDigits: 0
    }).format(Math.round(amount || 0));
};

const parseMoney = (str) => {
    if(typeof str === 'number') return str;
    if(!str) return 0;
    return parseFloat(str.toString().replace(/\./g, '')) || 0;
};

const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const split = dateStr.slice(0,10).split('-');
    if(split.length < 3) return dateStr;
    return `${split[2]}/${split[1]}/${split[0]}`; // DD/MM/YYYY
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('start-date-input');
    if(dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    
    // Inicializar selectores de tabla al mes actual
    const now = new Date();
    const monthSelect = document.getElementById('table-month');
    const yearSelect = document.getElementById('table-year');
    if(monthSelect) monthSelect.value = now.getMonth();
    if(yearSelect) yearSelect.value = now.getFullYear();
    
    const loanInputs = ['principal', 'interest_rate', 'installments_count'];
    loanInputs.forEach(id => {
        const el = document.querySelector(`#form-prestamo [name="${id}"]`);
        if(el) el.addEventListener('input', updateLoanCalculations);
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

    // Separador de miles en vivo para el pago
    const pagoAmountInput = document.getElementById('pago-amount');
    if (pagoAmountInput) {
        pagoAmountInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value) {
                e.target.value = new Intl.NumberFormat('es-PY').format(value);
            }
        });
    }

    fetchData();
});

function updateLoanCalculations() {
    const form = document.getElementById('form-prestamo');
    const principal = parseMoney(form.querySelector('[name="principal"]').value);
    const interestRate = parseFloat(form.querySelector('[name="interest_rate"]').value) || 0;
    const count = parseInt(form.querySelector('[name="installments_count"]').value) || 0;

    if (principal > 0 && count > 0) {
        const totalInterest = principal * (interestRate / 100) * count;
        const totalAmount = principal + totalInterest;
        const installmentAmount = totalAmount / count;
        document.getElementById('calc-installment').innerText = formatMoney(installmentAmount);
        document.getElementById('calc-total').innerText = formatMoney(totalAmount);
    } else {
        document.getElementById('calc-installment').innerText = '₲ 0';
        document.getElementById('calc-total').innerText = '₲ 0';
    }
}

function switchView(viewName, btnObj) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden-view'));
    document.querySelectorAll('.nav-btn:not(.bottom-btn)').forEach(el => el.classList.remove('nav-item-active'));
    document.querySelectorAll('.bottom-btn').forEach(el => el.classList.remove('bottom-nav-active'));
    
    const target = document.getElementById(`view-${viewName}`);
    if(target) target.classList.remove('hidden-view');
    
    if(btnObj) {
        if(btnObj.classList.contains('bottom-btn')) btnObj.classList.add('bottom-nav-active');
        else btnObj.classList.add('nav-item-active');
    }

    if (viewName === 'calendario') {
        if(calendarInstance) setTimeout(() => calendarInstance.render(), 100);
        renderPaymentsTable();
    }
}

async function fetchData() {
    try {
        const [resCustomers, resLoans, resInst, resDash] = await Promise.all([
            fetch(`${API_URL}/customers`).then(r => r.json()),
            fetch(`${API_URL}/loans`).then(r => r.json()),
            fetch(`${API_URL}/installments`).then(r => r.json()),
            fetch(`${API_URL}/dashboard`).then(r => r.json())
        ]);
        
        state.clients = resCustomers || [];
        state.loans = resLoans || [];
        state.installments = resInst || [];

        renderClientsList();
        renderLoansList();
        renderDashboard(resDash);
        renderCalendar();
        renderPaymentsTable();
        
        const selectClient = document.getElementById('select-client');
        if(selectClient) {
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
    if(!data) data = {};
    const kpis = {
        'dash-prestado': data.total_prestado,
        'dash-intereses': data.total_intereses,
        'dash-recuperado': data.total_recuperado,
        'dash-mora': data.total_mora
    };
    // Nota: El HTML original puede que no tenga todos estos IDs, pero los mapeamos por si acaso
    Object.keys(kpis).forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = formatMoney(kpis[id] || 0);
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

    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
    setVal('dash-hoy-esperado', formatMoney(hoyEsperado));
    setVal('dash-hoy-count', hoyCount);
    setVal('dash-pend-count', pendCount);
    setVal('dash-venc-count', vencCount);

    upcoming.sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
    const mList = document.getElementById('list-upcoming');
    if(mList) {
        mList.innerHTML = '';
        if(upcoming.length === 0) {
           mList.innerHTML = '<li class="py-2 text-sm text-gray-500">No hay pagos próximos.</li>'; 
        } else {
            upcoming.slice(0, 5).forEach(inst => {
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
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const revenues = { 'Jan': 0, 'Feb': 0, 'Mar': 0, 'Apr': 0, 'May': 0, 'Jun': 0, 'Jul': 0, 'Aug':0, 'Sep':0, 'Oct':0, 'Nov':0, 'Dec':0 };
    const monthNames = Object.keys(revenues);
    state.installments.forEach(inst => {
        const d = new Date(inst.due_date);
        const m = d.getMonth();
        if(m >= 0 && m < 12) revenues[monthNames[m]] += parseFloat(inst.total_due);
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
    if(!container) return;
    container.innerHTML = '';
    const filtered = state.clients.filter(c => c.full_name.toLowerCase().includes(term));
    if(filtered.length === 0) {
        container.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">No se encontraron clientes.</td></tr>';
        return;
    }
    filtered.forEach(c => {
        container.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors cursor-pointer" onclick="openExpedienteModal('${c.id}')">
                <td class="px-6 py-4">
                    <div class="font-medium text-gray-800">${c.full_name}</div>
                    <div class="text-[10px] text-gray-400">ID: ${c.id.slice(0,8)}</div>
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
    if(!container) return;
    container.innerHTML = '';
    if(state.loans.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">No hay préstamos registrados</p>';
        return;
    }
    state.loans.forEach(l => {
        const client = state.clients.find(c => c.id === l.customer_id);
        const clientName = client ? client.full_name : 'Desconocido';
        
        // Calcular cuotas resumen
        const loanInsts = state.installments.filter(inst => inst.loan_id === l.id);
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
                    <p class="text-xs text-gray-400">Ref #${l.id.slice(0,8)} • ${l.frequency}</p>
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
                                <span class="text-success">${pagadas} Pag.</span> / 
                                <span class="text-danger">${pendientes} Pend.</span>
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
    if(!calendarEl) return;
    
    let items = state.installments;
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

    if(!calendarInstance) {
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
                if(props.status === 'PENDIENTE' || props.status === 'ATRASADO') {
                    openPaymentModal(props.id, props.loan_id, props.client_name, props.total_due);
                }
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

function renderPaymentsTable() {
    const container = document.getElementById('payments-table-body');
    const searchEl = document.getElementById('search-payments');
    const term = searchEl ? searchEl.value.toLowerCase() : '';
    if(!container) return;
    
    let items = state.installments;
    
    // Filtro por mes/año seleccionado
    const selectedMonth = parseInt(document.getElementById('table-month').value);
    const selectedYear = parseInt(document.getElementById('table-year').value);
    
    items = items.filter(inst => {
        const d = new Date(inst.due_date);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    if (currentLoanFilter) items = items.filter(inst => inst.loan_id === currentLoanFilter);
    if (term) items = items.filter(inst => inst.client_name.toLowerCase().includes(term));

    container.innerHTML = '';
    
    if(items.length === 0) {
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
                        <button onclick="filterCalendarByLoan('${inst.loan_id}')" 
                            class="text-xs bg-gray-100 hover:bg-[#1E1E2D] hover:text-white px-3 py-1.5 rounded-lg transition-all font-medium border border-gray-200">Ver Perfil</button>
                        ${(inst.status === 'PENDIENTE' || inst.status === 'ATRASADO') ? `<button onclick="openPaymentModal('${inst.id}', '${inst.loan_id}', '${inst.client_name}', ${inst.total_due})" 
                            class="text-xs bg-primary text-white hover:bg-orange-600 px-3 py-1.5 rounded-lg transition-all font-bold shadow-sm">Cobrar</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
}

function filterCalendarByLoan(loanId) {
    currentLoanFilter = loanId;
    switchView('calendario', document.querySelector('[onclick*="calendario"]'));
    renderCalendar();
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
    try {
        const res = await fetch(`${API_URL}/customers/${clientId}/expediente`);
        const data = await res.json();
        const { customer, loans, installments, is_moroso } = data;

        document.getElementById('exp-client-name').innerText = `Expediente: ${customer.full_name}`;
        document.getElementById('exp-client-id').innerText = `ID: ${customer.id}`;

        // Resumen
        const totalPrestado = loans.reduce((sum, l) => sum + parseFloat(l.amount), 0);
        const loansCount = loans.length;
        const statusColor = is_moroso ? 'text-danger' : 'text-success';
        const statusText = is_moroso ? 'MOROSO' : 'LIMPIO';

        document.getElementById('exp-summary').innerHTML = `
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Prestado</p>
                <p class="text-lg font-black text-gray-800">${formatMoney(totalPrestado)}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Préstamos Totales</p>
                <p class="text-lg font-black text-gray-800">${loansCount}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Estado en Registro</p>
                <p class="text-lg font-black ${statusColor}">${statusText}</p>
            </div>
        `;

        // Historial de préstamos
        const container = document.getElementById('exp-loans-container');
        container.innerHTML = '';

        loans.forEach(l => {
            const lInsts = installments.filter(i => i.loan_id === l.id);
            const pagadas = lInsts.filter(i => i.status === 'PAGADO').length;
            const pendientes = lInsts.filter(i => i.status === 'PENDIENTE' || i.status === 'ATRASADO').length;
            
            const loanEl = document.createElement('div');
            loanEl.className = 'bg-white border border-gray-200 rounded-xl overflow-hidden';
            loanEl.innerHTML = `
                <div class="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                    <span class="text-xs font-bold text-gray-500">PRÉSTAMO #${l.id.slice(0,8)} • ${formatDate(l.created_at)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${l.status === 'FINALIZADO' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}">${l.status}</span>
                </div>
                <div class="p-4">
                    <div class="flex gap-8 mb-4">
                        <div>
                            <p class="text-[10px] text-gray-400 uppercase font-bold">Monto</p>
                            <p class="text-sm font-bold text-gray-800">${formatMoney(l.amount)}</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-gray-400 uppercase font-bold">Cuotas</p>
                            <p class="text-sm font-bold text-gray-800">
                                ${pagadas} / ${l.total_installments}
                                ${lInsts.length > l.total_installments ? `<span class="text-amber-600 text-[10px] ml-1">(+${lInsts.length - l.total_installments} Ext.)</span>` : ''}
                            </p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        ${lInsts.map(i => {
                            const isPaid = i.status === 'PAGADO';
                            const isExtended = i.installment_number > l.total_installments;
                            const isPartial = isPaid && parseFloat(i.paid_amount) < parseFloat(i.total_due);
                            
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
                            }
                            
                            return `
                                <div class="p-2 border rounded-lg ${bgColor} text-[10px] flex flex-col gap-1 relative">
                                    ${isExtended ? `<span class="absolute -top-2 -right-1 bg-amber-500 text-white text-[7px] px-1 rounded font-black shadow-sm">EXT</span>` : ''}
                                    <div class="flex items-center gap-1.5 font-bold ${textColor}">
                                        <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                                        Cuota ${i.installment_number}
                                    </div>
                                    <div class="flex justify-between font-medium">
                                        <span class="text-gray-400">Vence:</span>
                                        <span>${formatDate(i.due_date)}</span>
                                    </div>
                                    <div class="flex justify-between font-bold">
                                        <span class="text-gray-400">Total:</span>
                                        <span>₲ ${formatMoney(i.total_due).replace('₲', '').trim()}</span>
                                    </div>
                                    ${isPartial ? `<div class="text-[9px] text-orange-600 font-bold border-t border-orange-100 pt-1 mt-1">Pagó parcial: ${formatMoney(i.paid_amount)}</div>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            container.appendChild(loanEl);
        });

        openModal('modal-expediente');
    } catch (err) {
        alert("Error cargando expediente: " + err.message);
    }
}

function openClientModal(clientId = null) {
    const hiddenId = document.getElementById('client-id-hidden');
    const title = document.getElementById('modal-cliente-title');
    const form = document.getElementById('form-cliente');
    
    form.reset();
    
    if(clientId) {
        const client = state.clients.find(c => c.id === clientId);
        if(client) {
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
            const res = await fetch(`${API_URL}/customers/${id}`, { method: 'DELETE' });
            if(!res.ok) throw new Error(await res.text());
            fetchData();
        } catch(err) {
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
    if(form) form.reset();
}

async function submitForm(e, type) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    let endpoint = type === 'cliente' ? '/customers' : (type === 'prestamo' ? '/loans' : '/payments');
    
    // Mapeo específico para prestamos
    if(type === 'prestamo') {
        data.customer_id = data.client_id;
        data.amount = parseMoney(data.principal);
        data.total_installments = data.installments_count;
    }
    
    // Mapeo específico para clientes
    if(type === 'cliente') {
        data.full_name = data.name;
        // Si hay un ID, es edición
        const id = document.getElementById('client-id-hidden').value;
        if(id) {
            endpoint = `/customers/${id}`;
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if(!res.ok) throw new Error(await res.text());
            closeModal(`modal-${type}`);
            fetchData();
            return;
        }
    }

    // Mapeo específico para pagos
    if(type === 'pago') {
        data.installment_id = data.installment_id;
        data.amount = parseMoney(data.amount);
    }
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if(!res.ok) throw new Error(await res.text());
        closeModal(`modal-${type}`);
        fetchData();
    } catch(err) {
        alert("Error: " + err.message);
    } finally {
        if(btn) btn.disabled = false;
    }
}

function openPaymentModal(inst_id, loan_id, client_name, amount) {
    const elId = document.getElementById('pago-inst-id');
    if(!elId) return;
    elId.value = inst_id;
    document.getElementById('pago-loan-id').value = loan_id;
    document.getElementById('pago-desc').innerText = `Préstamo #${loan_id.slice(0,8)} - ${client_name}`;
    
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
    const loanInsts = state.installments.filter(inst => inst.loan_id === loan_id);
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
        const res = await fetch(`${API_URL}/trigger-accumulation`, { method: 'POST' });
        const data = await res.json();
        alert(data.message);
        fetchData();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function exportData(type) {
    const res = await fetch(`${API_URL}/export/${type}`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.json`;
    a.click();
}
