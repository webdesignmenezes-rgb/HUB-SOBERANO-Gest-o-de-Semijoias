import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  Package, 
  Scan, 
  Plus, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  Camera, 
  Image as ImageIcon, 
  FileText, 
  MessageCircle, 
  Download, 
  History,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Clock,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { scanImages, scanText, ScannedItem } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Employee {
  id: number;
  name: string;
  whatsapp: string;
  total_sales: number;
}

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  photo?: string;
}

interface CaseItem {
  id: number;
  case_id: number;
  product_id: number;
  quantity: number;
  price_at_time: number;
  product_name: string;
  product_category: string;
  product_photo?: string;
}

interface Case {
  id: number;
  name: string;
  employee_id: number | null;
  employee_name?: string;
  employee_whatsapp?: string;
  photo?: string;
  delivery_date: string;
  return_date: string;
  status: 'PARADO' | 'EM_CAMPO' | 'REPOSIÇÃO NECESSÁRIA';
  total_value: number;
  items: CaseItem[];
}

interface Stats {
  vgv: number;
  activeCases: number;
  premiumCases: number;
  totalEmployees: number;
  salesByEmployee: { name: string; value: number }[];
}

interface ManualCommission {
  id: number;
  employee_id: number;
  employee_name: string;
  product_name: string;
  price: number;
  commission_value: number;
  created_at: string;
}

// Components
const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={cn("bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden", className)} {...props}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  icon: Icon
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';
  className?: string;
  disabled?: boolean;
  icon?: any;
}) => {
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "bg-transparent text-zinc-500 hover:bg-zinc-50",
    gold: "bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-200"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [manualCommissions, setManualCommissions] = useState<ManualCommission[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualCommissionOpen, setIsManualCommissionOpen] = useState(false);

  // Modals
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCaseHistory, setShowCaseHistory] = useState<Case | null>(null);
  const [sharingCase, setSharingCase] = useState<Case | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, empRes, prodRes, caseRes, manualRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/employees'),
        fetch('/api/products'),
        fetch('/api/cases'),
        fetch('/api/manual-commissions')
      ]);
      setStats(await statsRes.json());
      setEmployees(await empRes.json());
      setProducts(await prodRes.json());
      setCases(await caseRes.json());
      setManualCommissions(await manualRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const calculateCommission = (total: number) => {
    const rate = total >= 5000 ? 0.4 : 0.3;
    return { rate: rate * 100, value: total * rate };
  };

  const sendWhatsAppAPI = async (caseObj: Case, pdfBase64?: string) => {
    const itemsList = caseObj.items.map(i => `- ${i.product_name} (${i.quantity}x): ${formatCurrency(i.price_at_time)}`).join('\n');
    const { rate, value: commission } = calculateCommission(caseObj.total_value);
    
    const message = `📦 *HUB SOBERANO - MALA ENTREGUE*\n\n` +
      `Olá ${caseObj.employee_name},\n` +
      `Sua maleta *${caseObj.name}* foi processada e o PDF está anexo.\n\n` +
      `*Resumo dos Itens:*\n${itemsList}\n\n` +
      `*Valor Total:* ${formatCurrency(caseObj.total_value)}\n` +
      `*Sua Comissão (${rate}%):* ${formatCurrency(commission)}\n\n` +
      `📅 *Data de Devolução:* ${new Date(caseObj.return_date).toLocaleDateString('pt-BR')}`;

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: caseObj.employee_id,
          case_id: caseObj.id,
          message,
          photo: caseObj.photo,
          pdf_base64: pdfBase64
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert("✅ Envio Automático: " + data.message);
      }
    } catch (error) {
      console.error("Erro ao enviar via API WhatsApp:", error);
    }
  };

  const generatePDF = async (caseObj: Case, autoSend = false) => {
    const doc = new jsPDF();
    const { rate, value: commission } = calculateCommission(caseObj.total_value);

    // Header
    doc.setFillColor(5, 150, 105); // Emerald 600
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("HUB SOBERANO - RELATÓRIO DE MALA", 15, 25);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`Maleta: ${caseObj.name}`, 15, 50);
    doc.text(`Vendedora: ${caseObj.employee_name || 'Não atribuída'}`, 15, 57);
    doc.text(`Data de Saída: ${new Date(caseObj.delivery_date).toLocaleDateString('pt-BR')}`, 15, 64);
    doc.text(`Data de Retorno: ${new Date(caseObj.return_date).toLocaleDateString('pt-BR')}`, 15, 71);

    // Table
    const tableData = caseObj.items.map(item => [
      item.product_name,
      item.product_category,
      item.quantity,
      formatCurrency(item.price_at_time),
      formatCurrency(item.price_at_time * item.quantity)
    ]);

    (doc as any).autoTable({
      startY: 80,
      head: [['Produto', 'Categoria', 'Qtd', 'Unitário', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105] }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text(`VALOR TOTAL: ${formatCurrency(caseObj.total_value)}`, 15, finalY);
    doc.setFontSize(11);
    doc.text(`Comissão Estimada (${rate}%): ${formatCurrency(commission)}`, 15, finalY + 7);

    // Get Base64 for API
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    
    doc.save(`Relatorio_${caseObj.name}.pdf`);

    if (autoSend && caseObj.employee_id) {
      await sendWhatsAppAPI(caseObj, pdfBase64);
    }
  };

  const sendWhatsApp = (caseObj: Case, employee: Employee) => {
    const itemsList = caseObj.items.map(i => `- ${i.product_name} (${i.quantity}x): ${formatCurrency(i.price_at_time)}`).join('\n');
    const { rate, value: commission } = calculateCommission(caseObj.total_value);
    
    const message = `📦 *HUB SOBERANO - MALA ENTREGUE*\n\n` +
      `Olá ${employee.name},\n` +
      `Sua maleta *${caseObj.name}* foi processada.\n\n` +
      `*Resumo dos Itens:*\n${itemsList}\n\n` +
      `*Valor Total:* ${formatCurrency(caseObj.total_value)}\n` +
      `*Sua Comissão (${rate}%):* ${formatCurrency(commission)}\n\n` +
      `📅 *Data de Devolução:* ${new Date(caseObj.return_date).toLocaleDateString('pt-BR')}\n\n` +
      `_Por favor, confira os itens e qualquer dúvida entre em contato._`;

    const url = `https://wa.me/${employee.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const deleteCase = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta maleta?")) return;
    await fetch(`/api/cases/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const deleteEmployee = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover esta vendedora?")) return;
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    fetchData();
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover este produto do catálogo?")) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Renderers
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-emerald-500">
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Joias na Rua</div>
          <div className="text-2xl font-bold text-zinc-900">{formatCurrency(stats?.vgv || 0)}</div>
          <div className="flex items-center gap-1 text-emerald-600 text-xs mt-1">
            <TrendingUp size={12} />
            <span>VGV Total</span>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-amber-500">
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Maletas em Campo</div>
          <div className="text-2xl font-bold text-zinc-900">{stats?.activeCases || 0}</div>
          <div className="flex items-center gap-1 text-amber-600 text-xs mt-1">
            <Briefcase size={12} />
            <span>Ativas</span>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-indigo-500">
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Ativos</div>
          <div className="text-2xl font-bold text-zinc-900">{stats?.totalEmployees || 0}</div>
          <div className="flex items-center gap-1 text-indigo-600 text-xs mt-1">
            <Users size={12} />
            <span>Vendedoras</span>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-purple-500">
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Malas Premium</div>
          <div className="text-2xl font-bold text-zinc-900">{stats?.premiumCases || 0}</div>
          <div className="flex items-center gap-1 text-purple-600 text-xs mt-1">
            <Star size={12} />
            <span>{'>'} R$ 8.000</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" size={20} />
            Distribuição de Vendas
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.salesByEmployee || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.salesByEmployee || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899'][index % 5]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="text-emerald-600" size={20} />
            Ranking de Performance
          </h3>
          <div className="space-y-4">
            {employees.sort((a, b) => b.total_sales - a.total_sales).slice(0, 5).map((emp, i) => {
              const { rate, value } = calculateCommission(emp.total_sales);
              return (
                <div key={emp.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900">{emp.name}</div>
                      <div className="text-xs text-zinc-500">Comissão: {rate}%</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-600">{formatCurrency(emp.total_sales)}</div>
                    <div className="text-xs text-zinc-500">Recebe: {formatCurrency(value)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );

  const renderCases = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-zinc-900">Gestão de Maletas</h2>
        <Button onClick={() => setIsScannerOpen(true)} icon={Scan} variant="gold">Novo Scanner</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cases.map(c => {
          const daysLeft = Math.ceil((new Date(c.return_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const isExpiring = daysLeft <= 7;
          const isPremium = c.total_value > 8000;

          return (
            <Card key={c.id} className={cn("relative", isPremium && "ring-2 ring-amber-400")}>
              {isPremium && (
                <div className="absolute top-2 right-2 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 z-10">
                  <Star size={10} fill="currentColor" /> PREMIUM
                </div>
              )}
              <div className="h-40 bg-zinc-100 relative overflow-hidden">
                {c.photo ? (
                  <img src={c.photo} className="w-full h-full object-cover" alt={c.name} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Briefcase size={48} />
                  </div>
                )}
                <div className="absolute bottom-2 left-2">
                  <span className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                    c.status === 'EM_CAMPO' ? "bg-emerald-500 text-white" : 
                    c.status === 'REPOSIÇÃO NECESSÁRIA' ? "bg-red-500 text-white" : "bg-zinc-500 text-white"
                  )}>
                    {c.status}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-zinc-900">{c.name}</h3>
                  <div className="text-emerald-600 font-bold">{formatCurrency(c.total_value)}</div>
                </div>
                <div className="space-y-2 text-sm text-zinc-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={14} />
                    <span>{c.employee_name || 'Sem vendedora'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} />
                    <span className={cn(isExpiring && "text-red-600 font-bold")}>
                      {daysLeft > 0 ? `Faltam ${daysLeft} dias` : 'Prazo Vencido'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="text-xs py-1.5" onClick={() => setEditingCase(c)} icon={Edit2}>Editar</Button>
                  <Button variant="secondary" className="text-xs py-1.5" onClick={() => setSharingCase(c)} icon={MessageCircle}>WhatsApp</Button>
                  <Button variant="secondary" className="text-xs py-1.5" onClick={() => generatePDF(c, true)} icon={Download}>PDF + API</Button>
                  <Button variant="danger" className="text-xs py-1.5" onClick={() => deleteCase(c.id)} icon={Trash2}>Excluir</Button>
                </div>
                {c.status === 'EM_CAMPO' && (
                  <Button 
                    variant="primary" 
                    className="w-full mt-2 text-xs py-1.5" 
                    onClick={() => setEditingCase(c)}
                    icon={Plus}
                  >
                    Adicionar Itens
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderComissionadas = () => {
    const activeCases = cases.filter(c => c.status !== 'PARADO');
    const allCommissionedItems: any[] = [];
    
    activeCases.forEach(c => {
      c.items.forEach(item => {
        allCommissionedItems.push({
          ...item,
          employee_name: c.employee_name,
          case_name: c.name,
          delivery_date: c.delivery_date
        });
      });
    });

    // Group by product for summary
    const productSummary = allCommissionedItems.reduce((acc: any, item) => {
      if (!acc[item.product_id]) {
        acc[item.product_id] = {
          name: item.product_name,
          category: item.product_category,
          total_qty: 0,
          total_value: 0,
          photo: item.product_photo
        };
      }
      acc[item.product_id].total_qty += item.quantity;
      acc[item.product_id].total_value += (item.price_at_time * item.quantity);
      return acc;
    }, {});

    const totalInField = allCommissionedItems.reduce((acc, item) => acc + (item.price_at_time * item.quantity), 0);
    const totalManualCommission = manualCommissions.reduce((acc, mc) => acc + mc.commission_value, 0);

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">Produtos Comissionados</h2>
            <p className="text-zinc-500 text-sm">Controle total de itens que estão atualmente com as vendedoras.</p>
          </div>
          <div className="flex gap-4">
            <Card className="p-4 bg-emerald-600 text-white border-none shadow-lg shadow-emerald-200">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total em Consignação</div>
              <div className="text-2xl font-black">{formatCurrency(totalInField)}</div>
            </Card>
            <Card className="p-4 bg-amber-500 text-white border-none shadow-lg shadow-amber-200">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Comissões Manuais</div>
              <div className="text-2xl font-black">{formatCurrency(totalManualCommission)}</div>
            </Card>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => setIsManualCommissionOpen(true)} variant="gold" icon={Plus}>Lançar Comissão Manual</Button>
        </div>

        {/* Manual Commissions Section */}
        {manualCommissions.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Star className="text-amber-500" size={20} />
              Lançamentos Manuais (Ex: Óculos)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {manualCommissions.map(mc => (
                <Card key={mc.id} className="p-4 border-l-4 border-amber-500 relative group">
                  <button 
                    onClick={async () => {
                      if(confirm("Excluir lançamento?")) {
                        await fetch(`/api/manual-commissions/${mc.id}`, { method: 'DELETE' });
                        fetchData();
                      }
                    }}
                    className="absolute top-2 right-2 p-1 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-zinc-900">{mc.product_name}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1">
                        <Users size={12} /> {mc.employee_name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-zinc-900">{formatCurrency(mc.price)}</div>
                      <div className="text-[10px] text-zinc-400 uppercase">{new Date(mc.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase">Comissão Direta</span>
                    <span className="text-lg font-black text-amber-600">{formatCurrency(mc.commission_value)}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Product Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.values(productSummary).map((prod: any, idx) => (
            <Card key={idx} className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 flex-shrink-0 overflow-hidden">
                {prod.photo ? (
                  <img src={prod.photo} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Package size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-900 truncate">{prod.name}</div>
                <div className="text-[10px] text-emerald-600 font-bold">{prod.total_qty} un. em campo</div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <History size={18} className="text-emerald-600" />
              Detalhamento por Vendedora
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase">Produto</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase">Vendedora</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase">Maleta</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase text-center">Qtd</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase text-right">Valor Unit.</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {allCommissionedItems.length > 0 ? (
                  allCommissionedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-100 flex-shrink-0 overflow-hidden">
                            {item.product_photo ? (
                              <img src={item.product_photo} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                <Package size={20} />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 text-sm">{item.product_name}</div>
                            <div className="text-[10px] text-zinc-500 uppercase">{item.product_category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                          <Users size={14} className="text-emerald-600" />
                          {item.employee_name || 'N/A'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md inline-block">
                          {item.case_name}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-bold text-zinc-900">{item.quantity}</span>
                      </td>
                      <td className="p-4 text-right text-sm text-zinc-600">
                        {formatCurrency(item.price_at_time)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="font-bold text-emerald-600">
                          {formatCurrency(item.price_at_time * item.quantity)}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-zinc-400">
                      <Package size={48} className="mx-auto mb-3 opacity-20" />
                      <p className="font-medium">Nenhuma semijoia em campo no momento.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const renderEmployees = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-zinc-900">Área de Funcionárias</h2>
        <Button onClick={() => setEditingEmployee({ id: 0, name: '', whatsapp: '', total_sales: 0 })} icon={Plus}>Nova Vendedora</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map(emp => {
          const { rate, value } = calculateCommission(emp.total_sales);
          return (
            <Card key={emp.id} className="p-4">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Users size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900">{emp.name}</h3>
                    <p className="text-sm text-zinc-500">{emp.whatsapp}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingEmployee(emp)} className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => deleteEmployee(emp.id)} className="p-2 text-zinc-400 hover:text-red-600 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
                <div>
                  <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Vendas (Mês)</div>
                  <div className="text-lg font-bold text-emerald-600">{formatCurrency(emp.total_sales)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Comissão ({rate}%)</div>
                  <div className="text-lg font-bold text-amber-600">{formatCurrency(value)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderProducts = () => {
    // Calculate field stock for each product
    const fieldStock = cases.filter(c => c.status !== 'PARADO').reduce((acc: any, c) => {
      c.items.forEach(item => {
        acc[item.product_id] = (acc[item.product_id] || 0) + item.quantity;
      });
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-zinc-900">Catálogo de Produtos</h2>
          <Button onClick={() => setEditingProduct({ id: 0, name: '', category: 'brinco', price: 0 })} icon={Plus}>Novo Produto</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {products.map(p => {
            const inField = fieldStock[p.id] || 0;
            return (
              <Card key={p.id} className="group cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all">
                <div className="aspect-square bg-zinc-100 relative overflow-hidden">
                  {p.photo ? (
                    <img src={p.photo} className="w-full h-full object-cover" alt={p.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                      <Package size={32} />
                    </div>
                  )}
                  {inField > 0 && (
                    <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                      {inField} EM CAMPO
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button onClick={() => setEditingProduct(p)} className="p-2 bg-white rounded-full text-zinc-900 hover:bg-emerald-500 hover:text-white transition-colors">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 bg-white rounded-full text-zinc-900 hover:bg-red-500 hover:text-white transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-xs font-bold text-zinc-900 truncate">{p.name}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">{p.category}</div>
                  <div className="text-sm font-bold text-emerald-600 mt-1">{formatCurrency(p.price)}</div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 sticky top-0 z-30 shadow-md border-b-2 border-amber-400/30">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-300 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Star className="text-emerald-900" size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent">HUB SOBERANO</h1>
              <p className="text-[10px] opacity-80 font-bold uppercase tracking-[0.2em] text-amber-100">Gestão de Semijoias</p>
            </div>
          </div>
          <button className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors">
            <Search size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'cases' && renderCases()}
            {activeTab === 'comissionadas' && renderComissionadas()}
            {activeTab === 'employees' && renderEmployees()}
            {activeTab === 'products' && renderProducts()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Scanner Button */}
      <div className="fixed bottom-24 right-4 z-40">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsScannerOpen(true)}
          className="w-16 h-16 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white"
        >
          <Scan size={32} />
        </motion.button>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 p-2 flex justify-around items-center z-30">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Início' },
          { id: 'cases', icon: Briefcase, label: 'Maletas' },
          { id: 'comissionadas', icon: DollarSign, label: 'Comissão' },
          { id: 'employees', icon: Users, label: 'Equipe' },
          { id: 'products', icon: Package, label: 'Catálogo' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
              activeTab === item.id ? "text-emerald-600 bg-emerald-50" : "text-zinc-400"
            )}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Scanner Modal */}
      <AnimatePresence>
        {isScannerOpen && (
          <ScannerModal 
            onClose={() => setIsScannerOpen(false)} 
            onSave={() => {
              setIsScannerOpen(false);
              fetchData();
            }}
            employees={employees}
            products={products}
            generatePDF={generatePDF}
          />
        )}
      </AnimatePresence>

      {/* Case Editor Modal */}
      <AnimatePresence>
        {editingCase && (
          <CaseEditorModal 
            caseObj={editingCase}
            employees={employees}
            products={products}
            onClose={() => setEditingCase(null)}
            onSave={() => {
              setEditingCase(null);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>

      {/* Employee Editor Modal */}
      <AnimatePresence>
        {editingEmployee && (
          <EmployeeEditorModal 
            employee={editingEmployee}
            onClose={() => setEditingEmployee(null)}
            onSave={() => {
              setEditingEmployee(null);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>

      {/* Product Editor Modal */}
      <AnimatePresence>
        {editingProduct && (
          <ProductEditorModal 
            product={editingProduct}
            onClose={() => setEditingProduct(null)}
            onSave={() => {
              setEditingProduct(null);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>

      {/* WhatsApp Share Modal */}
      <AnimatePresence>
        {sharingCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2"><MessageCircle size={20} /> Selecionar Destinatário</h3>
                <button onClick={() => setSharingCase(null)}><X size={24} /></button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                <p className="text-xs font-bold text-zinc-500 uppercase px-2 mb-2">Escolha a vendedora para enviar a maleta "{sharingCase.name}"</p>
                {employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => {
                      sendWhatsApp(sharingCase, emp);
                      setSharingCase(null);
                    }}
                    className="w-full flex items-center justify-between p-3 hover:bg-emerald-50 rounded-2xl transition-colors border border-zinc-100 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        {emp.name.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-zinc-900 group-hover:text-emerald-700">{emp.name}</div>
                        <div className="text-xs text-zinc-500">{emp.whatsapp}</div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-zinc-300 group-hover:text-emerald-500" />
                  </button>
                ))}
                {employees.length === 0 && (
                  <div className="text-center py-8 text-zinc-400">
                    <Users size={48} className="mx-auto mb-2 opacity-20" />
                    <p>Nenhuma vendedora cadastrada.</p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-zinc-100">
                <Button onClick={() => setSharingCase(null)} variant="secondary" className="w-full">Cancelar</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Commission Modal */}
      <AnimatePresence>
        {isManualCommissionOpen && (
          <ManualCommissionModal 
            employees={employees}
            onClose={() => setIsManualCommissionOpen(false)}
            onSave={() => {
              setIsManualCommissionOpen(false);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components (Modals)

function ManualCommissionModal({ employees, onClose, onSave }: any) {
  const [employeeId, setEmployeeId] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('');

  const handleSave = async () => {
    if (!employeeId || !productName || !price || !commission) {
      alert("Preencha todos os campos!");
      return;
    }

    await fetch('/api/manual-commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: parseInt(employeeId),
        product_name: productName,
        price: parseFloat(price),
        commission_value: parseFloat(commission)
      })
    });
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-4 bg-amber-500 text-white flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2"><Star size={20} /> Lançamento Manual</h3>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Vendedora</label>
            <select 
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full p-3 rounded-xl border border-zinc-200"
            >
              <option value="">Selecione...</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Produto (Ex: Óculos)</label>
            <input 
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Nome do produto"
              className="w-full p-3 rounded-xl border border-zinc-200"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Valor de Venda</label>
              <input 
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="R$ 159,00"
                className="w-full p-3 rounded-xl border border-zinc-200"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Comissão Direta</label>
              <input 
                type="number"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="R$ 30,00"
                className="w-full p-3 rounded-xl border border-zinc-200"
              />
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
            <p className="text-xs text-amber-800 font-medium">
              Este lançamento será contabilizado diretamente para a vendedora selecionada, independente das maletas em campo.
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-zinc-100 flex gap-3">
          <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} variant="gold" className="flex-1">Salvar Lançamento</Button>
        </div>
      </motion.div>
    </div>
  );
}

function ScannerModal({ onClose, onSave, employees, products, generatePDF }: any) {
  const [mode, setMode] = useState<'camera' | 'gallery' | 'text'>('camera');
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [caseName, setCaseName] = useState(`Mala ${new Date().toLocaleDateString('pt-BR')}`);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImage = (source: string) => {
    setSelectedImages(prev => [...prev, source]);
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleScan = async () => {
    if (selectedImages.length === 0) return;
    setLoading(true);
    try {
      const items = await scanImages(selectedImages);
      setScannedItems(items);
    } catch (error) {
      alert("Erro ao processar imagens.");
    } finally {
      setLoading(false);
    }
  };

  const handleTextScan = async () => {
    setLoading(true);
    try {
      const items = await scanText(textInput);
      setScannedItems(items);
    } catch (error) {
      alert("Erro ao processar texto.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (scannedItems.length === 0) return;
    
    // Map scanned items to existing products or create new ones?
    // For simplicity, we'll assume they are added to the case
    const itemsToSave = scannedItems.map(item => {
      const existing = products.find((p: any) => p.name.toLowerCase() === item.name.toLowerCase());
      return {
        product_id: existing?.id || 0, // In a real app, we'd handle unknown products
        quantity: item.quantity,
        price: item.price
      };
    });

    await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: caseName,
        employee_id: selectedEmployee || null,
        items: itemsToSave
      })
    });
    
    // If employee is selected, trigger automatic PDF and WhatsApp
    if (selectedEmployee) {
      const newCaseRes = await fetch('/api/cases');
      const allCases = await newCaseRes.json();
      const createdCase = allCases.sort((a: any, b: any) => b.id - a.id)[0];
      if (createdCase) {
        await generatePDF(createdCase, true);
      }
    }
    
    onSave();
  };

  const sendWhatsAppFromScanner = () => {
    const employee = employees.find((e: any) => e.id.toString() === selectedEmployee);
    if (!employee) {
      alert("Selecione uma vendedora para enviar!");
      return;
    }

    const itemsList = scannedItems.map(i => `- ${i.name} (${i.quantity}x): ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.price)}`).join('\n');
    const totalValue = scannedItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    const rate = totalValue >= 5000 ? 0.4 : 0.3;
    const commission = totalValue * rate;
    
    const message = `📦 *HUB SOBERANO - NOVA MALA DIGITAL*\n\n` +
      `Olá ${employee.name},\n` +
      `Sua nova maleta *${caseName}* foi digitalizada.\n\n` +
      `*Itens:* \n${itemsList}\n\n` +
      `*Valor Total:* ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}\n` +
      `*Sua Comissão (${rate * 100}%):* ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(commission)}\n\n` +
      `_Por favor, confira os itens._`;

    const url = `https://wa.me/${employee.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2"><Scan size={20} /> Scanner de Maletas</h3>
          <button onClick={onClose}><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {scannedItems.length === 0 ? (
            <div className="space-y-6">
              <div className="flex justify-center gap-4">
                <Button onClick={() => setMode('camera')} variant={mode === 'camera' ? 'primary' : 'secondary'} icon={Camera}>Câmera</Button>
                <Button onClick={() => setMode('gallery')} variant={mode === 'gallery' ? 'primary' : 'secondary'} icon={ImageIcon}>Galeria</Button>
                <Button onClick={() => setMode('text')} variant={mode === 'text' ? 'primary' : 'secondary'} icon={FileText}>Texto</Button>
              </div>

              {mode === 'camera' && (
                <div className="space-y-4">
                  <div className="aspect-video bg-zinc-900 rounded-2xl flex flex-col items-center justify-center text-white relative overflow-hidden">
                    <div className="absolute inset-0 border-2 border-emerald-500/50 m-8 rounded-xl"></div>
                    {loading && (
                      <motion.div 
                        animate={{ y: [0, 150, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute top-0 left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] z-10"
                      />
                    )}
                    <Camera size={48} className="mb-4 opacity-50" />
                    <p className="text-sm opacity-70">Simulação de Câmera Ativa</p>
                    <Button onClick={() => addImage('https://picsum.photos/seed/' + Math.random() + '/800/600')} className="mt-4" icon={Plus}>Capturar Foto</Button>
                  </div>
                </div>
              )}

              {mode === 'gallery' && (
                <div className="space-y-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-video border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center text-zinc-400 cursor-pointer hover:bg-zinc-50 transition-colors"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      multiple
                      className="hidden" 
                      onChange={(e) => {
                        const target = e.target as HTMLInputElement;
                        const files = Array.from(target.files || []);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = (ev: ProgressEvent<FileReader>) => {
                            const result = ev.target?.result;
                            if (typeof result === 'string') {
                              addImage(result);
                            }
                          };
                          reader.readAsDataURL(file);
                        });
                      }}
                    />
                    <ImageIcon size={48} className="mb-4" />
                    <p className="font-bold text-center px-4">Clique para selecionar fotos da Galeria (Múltiplas)</p>
                  </div>
                </div>
              )}

              {selectedImages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase">Fotos Selecionadas ({selectedImages.length})</h4>
                    <button onClick={() => setSelectedImages([])} className="text-xs text-red-500 font-bold">Limpar Todas</button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {selectedImages.map((img, idx) => (
                      <div key={idx} className="aspect-square rounded-xl overflow-hidden relative group border border-zinc-100">
                        <img src={img} className="w-full h-full object-cover" alt={`Preview ${idx}`} />
                        <button 
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => mode === 'camera' ? addImage('https://picsum.photos/seed/' + Math.random() + '/800/600') : fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-zinc-200 flex items-center justify-center text-zinc-400 hover:bg-zinc-50 transition-colors"
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                  <Button onClick={handleScan} className="w-full py-4 text-lg" icon={Scan} disabled={loading}>
                    {loading ? 'Analisando...' : `Analisar ${selectedImages.length} Fotos`}
                  </Button>
                </div>
              )}

              {mode === 'text' && (
                <div className="space-y-4">
                  <textarea 
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Cole aqui a lista de produtos e valores..."
                    className="w-full h-40 p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  />
                  <Button onClick={handleTextScan} className="w-full" icon={ArrowRight} disabled={!textInput}>Processar Texto</Button>
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="font-bold text-emerald-600">IA está analisando...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 font-bold mb-4">
                  <CheckCircle2 size={20} /> Itens Identificados
                </div>
                <div className="space-y-2">
                  {scannedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm">
                      <div>
                        <div className="font-bold text-zinc-900">{item.name}</div>
                        <div className="text-[10px] uppercase text-zinc-500">{item.category}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm font-bold text-emerald-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              const newItems = [...scannedItems];
                              newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                              setScannedItems(newItems);
                            }}
                            className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center"
                          >-</button>
                          <span className="font-bold w-4 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => {
                              const newItems = [...scannedItems];
                              newItems[idx].quantity += 1;
                              setScannedItems(newItems);
                            }}
                            className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center"
                          >+</button>
                        </div>
                        <button 
                          onClick={() => setScannedItems(scannedItems.filter((_, i) => i !== idx))}
                          className="text-red-500"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Nome da Maleta</label>
                  <input 
                    value={caseName}
                    onChange={(e) => setCaseName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Vendedora Responsável</label>
                  <select 
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="w-full p-3 rounded-xl border border-zinc-200"
                  >
                    <option value="">Apenas Salvar no Estoque</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-100 flex flex-col gap-3">
          {scannedItems.length > 0 && (
            <>
              <div className="flex gap-3">
                <Button onClick={() => { setScannedItems([]); setSelectedImages([]); }} variant="secondary" className="flex-1">Refazer</Button>
                <Button onClick={handleSave} variant="primary" className="flex-1">Salvar Maleta</Button>
              </div>
              <Button 
                onClick={sendWhatsAppFromScanner} 
                variant="secondary" 
                className="w-full bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100"
                icon={MessageCircle}
                disabled={!selectedEmployee}
              >
                Enviar Resumo via WhatsApp
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function CaseEditorModal({ caseObj, employees, products, onClose, onSave }: any) {
  const [name, setName] = useState(caseObj.name);
  const [employeeId, setEmployeeId] = useState(caseObj.employee_id || '');
  const [status, setStatus] = useState(caseObj.status);
  const [items, setItems] = useState<any[]>(caseObj.items || []);
  const [showProductSelector, setShowProductSelector] = useState(false);

  const handleSave = async () => {
    await fetch(`/api/cases/${caseObj.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        employee_id: employeeId || null,
        status,
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          price: i.price_at_time
        }))
      })
    });
    onSave();
  };

  const total = items.reduce((acc, i) => acc + (i.price_at_time * i.quantity), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2"><Edit2 size={20} /> Editar Maleta</h3>
          <button onClick={onClose}><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Vendedora</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200">
                <option value="">Nenhuma</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200">
                <option value="PARADO">PARADO</option>
                <option value="EM_CAMPO">EM CAMPO</option>
                <option value="REPOSIÇÃO NECESSÁRIA">REPOSIÇÃO NECESSÁRIA</option>
              </select>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex flex-col justify-center">
              <div className="text-[10px] uppercase font-bold text-emerald-600">Valor Total Atual</div>
              <div className="text-xl font-bold text-emerald-700">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-zinc-900">Itens da Maleta</h4>
              <Button onClick={() => setShowProductSelector(true)} variant="secondary" className="text-xs" icon={Plus}>Adicionar Produto</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg overflow-hidden border border-zinc-200">
                      {item.product_photo ? <img src={item.product_photo} className="w-full h-full object-cover" /> : <Package className="w-full h-full p-2 text-zinc-300" />}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{item.product_name}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">{item.product_category}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-bold text-emerald-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price_at_time)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        const newItems = [...items];
                        newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                        setItems(newItems);
                      }} className="w-6 h-6 rounded-full bg-white border border-zinc-200 flex items-center justify-center">-</button>
                      <span className="font-bold w-4 text-center">{item.quantity}</span>
                      <button onClick={() => {
                        const newItems = [...items];
                        newItems[idx].quantity += 1;
                        setItems(newItems);
                      }} className="w-6 h-6 rounded-full bg-white border border-zinc-200 flex items-center justify-center">+</button>
                    </div>
                    <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-100 flex gap-3">
          <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} variant="primary" className="flex-1">Salvar Alterações</Button>
        </div>

        {showProductSelector && (
          <div className="absolute inset-0 z-[60] bg-white p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">Selecionar Produto</h3>
              <button onClick={() => setShowProductSelector(false)}><X size={24} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {products.map((p: any) => (
                <div 
                  key={p.id} 
                  onClick={() => {
                    setItems([...items, {
                      product_id: p.id,
                      product_name: p.name,
                      product_category: p.category,
                      product_photo: p.photo,
                      quantity: 1,
                      price_at_time: p.price
                    }]);
                    setShowProductSelector(false);
                  }}
                  className="p-3 border border-zinc-200 rounded-2xl cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-all"
                >
                  <div className="aspect-square bg-zinc-100 rounded-xl mb-2 overflow-hidden">
                    {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <Package className="w-full h-full p-4 text-zinc-300" />}
                  </div>
                  <div className="font-bold text-xs truncate">{p.name}</div>
                  <div className="text-emerald-600 font-bold text-sm">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function EmployeeEditorModal({ employee, onClose, onSave }: any) {
  const [name, setName] = useState(employee.name);
  const [whatsapp, setWhatsapp] = useState(employee.whatsapp);

  const handleSave = async () => {
    const method = employee.id ? 'PUT' : 'POST';
    const url = employee.id ? `/api/employees/${employee.id}` : '/api/employees';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, whatsapp })
    });
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
          <h3 className="font-bold">{employee.id ? 'Editar Vendedora' : 'Nova Vendedora'}</h3>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Nome Completo</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200" placeholder="Ex: Maria Silva" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">WhatsApp</label>
            <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200" placeholder="Ex: 5511999998888" />
          </div>
          <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
            <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Regra de Comissão</div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Até R$ 4.999</span>
                <span className="font-bold text-emerald-600">30%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>A partir de R$ 5.000</span>
                <span className="font-bold text-emerald-600">40%</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-zinc-100 flex gap-3">
          <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} variant="primary" className="flex-1">Salvar</Button>
        </div>
      </motion.div>
    </div>
  );
}

function ProductEditorModal({ product, onClose, onSave }: any) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [price, setPrice] = useState(product.price);
  const [photo, setPhoto] = useState(product.photo || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const method = product.id ? 'PUT' : 'POST';
    const url = product.id ? `/api/products/${product.id}` : '/api/products';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, photo })
    });
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
          <h3 className="font-bold">{product.id ? 'Editar Produto' : 'Novo Produto'}</h3>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square w-32 mx-auto bg-zinc-100 rounded-2xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-400 cursor-pointer overflow-hidden relative"
          >
            {photo ? (
              <img src={photo} className="w-full h-full object-cover" />
            ) : (
              <>
                <Camera size={24} />
                <span className="text-[10px] font-bold mt-1">FOTO</span>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setPhoto(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Nome do Produto</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200" placeholder="Ex: Brinco Argola Ouro" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Categoria</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-3 rounded-xl border border-zinc-200">
              <option value="brinco">Brinco</option>
              <option value="anel">Anel</option>
              <option value="pulseira">Pulseira</option>
              <option value="corrente">Corrente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Preço Unitário</label>
            <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full p-3 rounded-xl border border-zinc-200" placeholder="0.00" />
          </div>
        </div>
        <div className="p-4 border-t border-zinc-100 flex gap-3">
          <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} variant="primary" className="flex-1">Salvar</Button>
        </div>
      </motion.div>
    </div>
  );
}
