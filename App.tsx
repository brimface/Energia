import React, { useState, useMemo, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { extractBillData } from './services/geminiService';
import { BillData, NewOfferData, AnalysisStatus, ComparisonResult, SavedSimulation } from './types';
import { Zap, Activity, FileText, AlertTriangle, ArrowRight, TrendingDown, TrendingUp, Info, Calculator, Edit3, ChevronDown, ChevronUp, Scale, Store, Save, RotateCcw, Plus, Trophy, Trash2, Eye } from 'lucide-react';

// Funções para gerar estado inicial limpo (Factory Pattern)
// Usar funções garante que recebemos sempre um novo objeto, evitando referências partilhadas/mutadas
const getInitialBillData = (): BillData => ({
  monthlyConsumptionKwh: 0,
  contractedPowerKva: 0,
  audiovisualTax: 0,
  dgegTax: 0,
  ieceTax: 0,
  socialTariff: 0,
  totalAmount: 0,
  billingPeriodDays: 30,
  currentPowerPricePerDay: 0,
  currentEnergyPricePerKwh: 0
});

const getInitialOfferData = (): NewOfferData => ({
  supplierName: '',
  powerPricePerDay: 0,
  energyPricePerKwh: 0
});

const App: React.FC = () => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTaxesExpanded, setIsTaxesExpanded] = useState<boolean>(false);
  const [uploadKey, setUploadKey] = useState<number>(0);
  const formRef = useRef<HTMLDivElement>(null);
  const multiCompRef = useRef<HTMLDivElement>(null);

  // Inicializar estado usando as funções
  const [billData, setBillData] = useState<BillData>(getInitialBillData());
  const [newOffer, setNewOffer] = useState<NewOfferData>(getInitialOfferData());
  
  // State for multi-simulation comparison
  const [multiSimulations, setMultiSimulations] = useState<SavedSimulation[]>([]);

  const handleReset = () => {
    if (window.confirm("Tem a certeza que pretende limpar todos os dados e iniciar uma nova simulação?")) {
      // Reiniciar com novos objetos limpos
      setBillData(getInitialBillData());
      setNewOffer(getInitialOfferData());
      setMultiSimulations([]);
      setStatus(AnalysisStatus.IDLE);
      setErrorMsg(null);
      setIsTaxesExpanded(false);
      setUploadKey(prev => prev + 1); // Forçar recriação do componente de upload
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleClearFile = () => {
    // Limpar apenas os dados da fatura quando o ficheiro é removido
    // Mantemos a nova proposta caso o utilizador queira testar outra fatura com a mesma proposta
    setBillData(getInitialBillData());
    setStatus(AnalysisStatus.IDLE);
    setErrorMsg(null);
    setIsTaxesExpanded(false);
  };

  const handleFileSelect = async (base64: string, mimeType: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setErrorMsg(null);
    setIsTaxesExpanded(true); // Auto-expand taxes when data is loaded
    
    try {
      // Check if it is a JSON file (Simulation Import)
      if (mimeType === 'application/json' || base64.startsWith('ew')) { // 'ew' is base64 for '{'
        try {
          const jsonString = atob(base64);
          const savedData = JSON.parse(jsonString) as SavedSimulation;
          
          if (savedData.billData && savedData.newOffer) {
            setBillData(savedData.billData);
            setNewOffer(savedData.newOffer);
            setStatus(AnalysisStatus.SUCCESS);
            return;
          } else {
             throw new Error("Formato de ficheiro inválido");
          }
        } catch (e) {
          console.error("JSON Parse Error", e);
          throw new Error("O ficheiro JSON não é uma simulação válida.");
        }
      }

      // If not JSON, proceed with Gemini extraction
      const data = await extractBillData(base64, mimeType);
      setBillData(data);
      setStatus(AnalysisStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Não foi possível analisar o ficheiro. Por favor tente novamente.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- MULTI SIMULATION HANDLERS ---
  const handleAddMultiSimulations = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files);
      const newSims: SavedSimulation[] = [];
      let processedCount = 0;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            if (event.target?.result) {
              const json = JSON.parse(event.target.result as string) as SavedSimulation;
              if (json.newOffer) {
                if (!json.timestamp) json.timestamp = new Date().toISOString();
                newSims.push(json);
              }
            }
          } catch (err) {
            console.error("Error parsing multi-sim file", file.name, err);
          } finally {
            processedCount++;
            if (processedCount === files.length) {
              setMultiSimulations(prev => [...prev, ...newSims]);
              if (multiCompRef.current) {
                setTimeout(() => multiCompRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
              }
            }
          }
        };
        reader.readAsText(file);
      });
    }
    // Reset input
    e.target.value = '';
  };

  const removeMultiSimulation = (index: number) => {
    setMultiSimulations(prev => prev.filter((_, i) => i !== index));
  };

  const loadSimulationToMain = (sim: SavedSimulation) => {
    setNewOffer(sim.newOffer);
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // --- VAT CALCULATION LOGIC ---
  const calculateWithVat = (
    consumption: number, 
    powerKva: number, 
    days: number,
    powerPrice: number, 
    energyPrice: number, 
    taxes: { cav: number; dgeg: number; iec: number; social: number }
  ) => {
    const IVA_LOW = 0.06;
    const IVA_NORMAL = 0.23;

    // 1. Power Cost & VAT
    // Power <= 6.9 kVA gets 6% VAT, else 23%
    const powerBaseCost = days * powerPrice;
    const powerVatRate = powerKva <= 6.9 ? IVA_LOW : IVA_NORMAL;
    const powerVat = powerBaseCost * powerVatRate;

    // 2. Energy Cost & VAT
    // If Power <= 6.9: First 100kWh at 6%, rest at 23%. Else 23%.
    const energyBaseCost = consumption * energyPrice;
    let energyVat = 0;

    if (powerKva <= 6.9) {
      const tier1Cap = 100;
      const tier1Kwh = Math.min(consumption, tier1Cap);
      const tier2Kwh = Math.max(0, consumption - tier1Cap);
      
      const tier1Cost = tier1Kwh * energyPrice;
      const tier2Cost = tier2Kwh * energyPrice;
      
      energyVat = (tier1Cost * IVA_LOW) + (tier2Cost * IVA_NORMAL);
    } else {
      energyVat = energyBaseCost * IVA_NORMAL;
    }

    // 3. Taxes VAT
    // CAV is 6%, DGEG/IEC are 23%
    const cavVat = taxes.cav * IVA_LOW;
    const dgegVat = taxes.dgeg * IVA_NORMAL;
    const iecVat = taxes.iec * IVA_NORMAL;
    const socialVat = 0; // Usually exempt or handled as gross deduction

    const totalBase = powerBaseCost + energyBaseCost + taxes.cav + taxes.dgeg + taxes.iec + taxes.social;
    const totalVat = powerVat + energyVat + cavVat + dgegVat + iecVat + socialVat;
    const totalWithVat = totalBase + totalVat;

    return {
      base: totalBase,
      vat: totalVat,
      total: totalWithVat,
      components: {
        energy: { base: energyBaseCost, vat: energyVat, total: energyBaseCost + energyVat },
        power: { base: powerBaseCost, vat: powerVat, total: powerBaseCost + powerVat },
        taxes: { 
          base: taxes.cav + taxes.dgeg + taxes.iec + taxes.social, 
          vat: cavVat + dgegVat + iecVat + socialVat,
          total: (taxes.cav + taxes.dgeg + taxes.iec + taxes.social) + (cavVat + dgegVat + iecVat + socialVat)
        }
      }
    };
  };

  // Calculate Current Bill Total independently
  const currentCalculated = useMemo(() => {
    return calculateWithVat(
      billData.monthlyConsumptionKwh,
      billData.contractedPowerKva,
      billData.billingPeriodDays,
      billData.currentPowerPricePerDay || 0,
      billData.currentEnergyPricePerKwh || 0,
      {
        cav: billData.audiovisualTax,
        dgeg: billData.dgegTax,
        iec: billData.ieceTax,
        social: billData.socialTariff
      }
    );
  }, [billData]);

  const comparison: ComparisonResult | null = useMemo(() => {
    // Only compare if we have consumption data
    if (billData.monthlyConsumptionKwh === 0) return null;

    const current = currentCalculated;

    const newOfferCalc = calculateWithVat(
      billData.monthlyConsumptionKwh,
      billData.contractedPowerKva,
      billData.billingPeriodDays,
      newOffer.powerPricePerDay,
      newOffer.energyPricePerKwh,
      {
        cav: billData.audiovisualTax,
        dgeg: billData.dgegTax,
        iec: billData.ieceTax,
        social: billData.socialTariff
      }
    );
    
    const difference = current.total - newOfferCalc.total;

    return {
      currentTotal: current.total,
      newTotal: newOfferCalc.total,
      currentBase: current.base,
      newBase: newOfferCalc.base,
      difference,
      isCheaper: newOfferCalc.total < current.total,
      yearlySavings: difference * (365 / billData.billingPeriodDays),
      details: {
        energyCost: { current: current.components.energy.total, new: newOfferCalc.components.energy.total },
        powerCost: { current: current.components.power.total, new: newOfferCalc.components.power.total },
        taxes: { current: current.components.taxes.total, new: newOfferCalc.components.taxes.total }
      }
    };
  }, [billData, newOffer, currentCalculated]);

  // Multi Comparisons Calculation
  const multiComparisonResults = useMemo(() => {
    if (billData.monthlyConsumptionKwh === 0 || multiSimulations.length === 0) return [];

    const taxes = {
      cav: billData.audiovisualTax,
      dgeg: billData.dgegTax,
      iec: billData.ieceTax,
      social: billData.socialTariff
    };

    const results = multiSimulations.map((sim, index) => {
      const calc = calculateWithVat(
        billData.monthlyConsumptionKwh,
        billData.contractedPowerKva,
        billData.billingPeriodDays,
        sim.newOffer.powerPricePerDay,
        sim.newOffer.energyPricePerKwh,
        taxes
      );
      
      const diff = currentCalculated.total - calc.total;
      const yearlySavings = diff * (365 / billData.billingPeriodDays);

      return {
        ...sim,
        originalIndex: index,
        calculatedTotal: calc.total,
        yearlySavings,
        isCheaper: calc.total < currentCalculated.total
      };
    });

    // Sort by Total Cost (Ascending - Cheapest first)
    return results.sort((a, b) => a.calculatedTotal - b.calculatedTotal);
  }, [billData, multiSimulations, currentCalculated]);

  const handleBillChange = (field: keyof BillData, value: string) => {
    const numValue = parseFloat(value) || 0;
    setBillData(prev => ({ ...prev, [field]: numValue }));
  };

  const handleOfferChange = (field: keyof NewOfferData, value: string) => {
    if (field === 'supplierName') {
      setNewOffer(prev => ({ ...prev, [field]: value }));
      return;
    }
    const numValue = parseFloat(value) || 0;
    setNewOffer(prev => ({ ...prev, [field]: numValue }));
  };

  // Helper to format currency - NO SYMBOL
  const fmt = (val: number) => val.toFixed(2);

  const handleDownloadReport = () => {
    if (!comparison) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-PT');
    const timeStr = now.toLocaleTimeString('pt-PT');
    const supplier = newOffer.supplierName ? newOffer.supplierName.replace(/\s+/g, '_') : 'Nova_Proposta';
    
    // Create text content
    const content = `
=========================================
      RELATÓRIO COMPARAR ENERGIA
=========================================
Data de Emissão: ${dateStr} às ${timeStr}
Fornecedor Analisado: ${newOffer.supplierName || 'Não especificado'}

DADOS DE CONSUMO
-----------------------------------------
Consumo Mensal: ${billData.monthlyConsumptionKwh} kWh
Potência: ${billData.contractedPowerKva} kVA
Período: ${billData.billingPeriodDays} dias

RESUMO FINANCEIRO (MENSAL)
-----------------------------------------
Fatura Atual (Estimada c/ IVA): ${fmt(comparison.currentTotal)} EUR
Nova Proposta (${newOffer.supplierName || 'Nova'}): ${fmt(comparison.newTotal)} EUR

RESULTADO: ${comparison.isCheaper ? 'POUPANÇA' : 'AGRAVAMENTO'}
Diferença Mensal: ${comparison.isCheaper ? '-' : '+'}${fmt(Math.abs(comparison.difference))} EUR
Poupança Anual Est.: ${fmt(comparison.yearlySavings)} EUR

DETALHES DA NOVA PROPOSTA (Valores Unitários s/ IVA)
-----------------------------------------
Energia: ${newOffer.energyPricePerKwh} EUR/kWh
Potência: ${newOffer.powerPricePerDay} EUR/dia

DETALHAMENTO DE CUSTOS (C/ IVA)
-----------------------------------------
[Energia]
Atual: ${fmt(comparison.details.energyCost.current)} EUR
Nova:  ${fmt(comparison.details.energyCost.new)} EUR

[Potência]
Atual: ${fmt(comparison.details.powerCost.current)} EUR
Nova:  ${fmt(comparison.details.powerCost.new)} EUR

[Taxas e Impostos]
Valor: ${fmt(comparison.details.taxes.current)} EUR

-----------------------------------------
Gerado automaticamente por Comparar Energia
    `;

    // Create blob and download link
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Format: Comparativo_Fornecedor_YYYY-MM-DD_HHmm.txt
    const timestamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '_');
    link.download = `Relatorio_${supplier}_${timestamp}.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveSimulation = () => {
    const now = new Date();
    const supplier = newOffer.supplierName ? newOffer.supplierName.replace(/\s+/g, '_') : 'Simulacao';
    
    const saveData: SavedSimulation = {
      version: "1.0",
      timestamp: now.toISOString(),
      billData: billData,
      newOffer: newOffer
    };

    const jsonString = JSON.stringify(saveData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Naming it Comparativo_X.json as requested for the main save action
    const timestamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '_');
    link.download = `Comparativo_${supplier}_${timestamp}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-24 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Zap className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Comparar <span className="text-emerald-500">Energia</span></h1>
          </div>
          
          <div className="flex items-center space-x-4">
             {status !== AnalysisStatus.IDLE && (
                <button 
                  onClick={handleReset}
                  className="flex items-center text-slate-500 hover:text-red-600 transition-colors text-sm font-medium"
                  title="Limpar todos os dados e começar de novo"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Nova Simulação</span>
                </button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Intro Section */}
        <section className="mb-10 text-center max-w-2xl mx-auto">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <FileUpload 
              key={uploadKey}
              onFileSelect={handleFileSelect}
              onClear={handleClearFile}
              isLoading={status === AnalysisStatus.ANALYZING} 
            />
            
            <div className="mt-4 flex items-center justify-center">
               <button 
                 onClick={scrollToForm}
                 className="text-sm text-slate-500 hover:text-emerald-600 font-medium flex items-center transition-colors border border-slate-200 hover:border-emerald-200 rounded-full px-4 py-1.5 bg-slate-50 hover:bg-emerald-50"
               >
                 <Edit3 className="w-3 h-3 mr-2" />
                 Não tenho fatura / Preencher Manualmente
               </button>
            </div>

            {status === AnalysisStatus.ERROR && (
               <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 flex items-center justify-center">
                 <AlertTriangle className="w-4 h-4 mr-2"/> {errorMsg}
               </div>
            )}
          </div>
        </section>

        <div ref={formRef} className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          
          {/* Left Column: Current Data */}
          <div className="transition-all duration-300">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-blue-500" />
                  Dados da Fatura Atual
                </h3>
                {status === AnalysisStatus.SUCCESS ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Extraído com Sucesso</span>
                ) : (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-medium">Preenchimento Manual</span>
                )}
              </div>
              
              <div className="p-6 space-y-6">
                {/* Main Consumption Data */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Consumo Mensal (kWh)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={billData.monthlyConsumptionKwh || ''}
                        onChange={(e) => handleBillChange('monthlyConsumptionKwh', e.target.value)}
                        className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-sm">kWh</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Potência (kVA)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={billData.contractedPowerKva || ''}
                        onChange={(e) => handleBillChange('contractedPowerKva', e.target.value)}
                        className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-sm">kVA</span>
                    </div>
                  </div>
                </div>

                {/* Current Unit Prices */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Preço Potência Atual <span className="text-slate-400">(s/ IVA)</span></label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.0001"
                        value={billData.currentPowerPricePerDay || ''}
                        onChange={(e) => handleBillChange('currentPowerPricePerDay', e.target.value)}
                        className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900 text-sm"
                        placeholder="0.0000"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-xs">EUR/dia</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Preço Energia Atual <span className="text-slate-400">(s/ IVA)</span></label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.0001"
                        value={billData.currentEnergyPricePerKwh || ''}
                        onChange={(e) => handleBillChange('currentEnergyPricePerKwh', e.target.value)}
                        className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900 text-sm"
                        placeholder="0.0000"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-xs">EUR/kWh</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Taxes Section (Expandable) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <button 
                    onClick={() => setIsTaxesExpanded(!isTaxesExpanded)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors focus:outline-none"
                  >
                    <div className="flex items-center text-sm font-semibold text-slate-700">
                      <Activity className="w-4 h-4 mr-2 text-slate-400"/>
                      Taxas e Impostos (Base s/ IVA)
                    </div>
                    <div className="flex items-center space-x-3">
                       <span className="text-sm font-medium text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                         {fmt(billData.audiovisualTax + billData.dgegTax + billData.ieceTax + billData.socialTariff)}
                       </span>
                       {isTaxesExpanded ? (
                         <ChevronUp className="w-4 h-4 text-slate-400" />
                       ) : (
                         <ChevronDown className="w-4 h-4 text-slate-400" />
                       )}
                    </div>
                  </button>
                  
                  {isTaxesExpanded && (
                    <div className="p-4 space-y-3 bg-white border-t border-slate-100 animate-fade-in">
                      <div className="flex justify-between items-center">
                        <label className="text-sm text-slate-600">Contribuição Audiovisual (CAV)</label>
                        <div className="w-24 relative">
                          <input 
                            type="number" 
                            value={billData.audiovisualTax}
                            onChange={(e) => handleBillChange('audiovisualTax', e.target.value)}
                            className="w-full text-right bg-white text-slate-900 border border-slate-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-sm text-slate-600">Taxa Exploração DGEG</label>
                        <div className="w-24 relative">
                          <input 
                            type="number" 
                            value={billData.dgegTax}
                            onChange={(e) => handleBillChange('dgegTax', e.target.value)}
                            className="w-full text-right bg-white text-slate-900 border border-slate-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-sm text-slate-600">Imposto Especial Consumo (IEC)</label>
                        <div className="w-24 relative">
                          <input 
                            type="number" 
                            value={billData.ieceTax}
                            onChange={(e) => handleBillChange('ieceTax', e.target.value)}
                            className="w-full text-right bg-white text-slate-900 border border-slate-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                       <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                        <label className="text-sm text-slate-600 font-medium">Tarifa Social (Desconto)</label>
                        <div className="w-24 relative">
                          <input 
                            type="number" 
                            value={billData.socialTariff}
                            onChange={(e) => handleBillChange('socialTariff', e.target.value)}
                            className="w-full text-right bg-white border border-slate-200 rounded px-2 py-1 text-sm text-green-600 font-medium focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Total Current Bill */}
                <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                  <div className="text-sm text-slate-500">
                    <p>Período de {billData.billingPeriodDays} dias</p>
                    <div className="flex items-center space-x-1 mt-1">
                      <Calculator className="w-3 h-3 text-slate-400"/>
                      <p className="text-xs text-slate-400">Total calculado com base nos dados (s/ IVA)</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total c/ IVA Estimado</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {fmt(currentCalculated.total)}
                    </p>
                    {billData.totalAmount > 0 && Math.abs(billData.totalAmount - currentCalculated.total) > 0.5 && (
                       <p className="text-xs text-slate-400 mt-1" title="Valor extraído da fatura">
                        (Total Fatura: {fmt(billData.totalAmount)})
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: New Offer */}
          <div>
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden h-full">
              <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100">
                <h3 className="font-semibold text-emerald-800 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-emerald-600" />
                  Nova Proposta
                </h3>
              </div>
              
              <div className="p-6 space-y-8">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
                   <div className="flex items-start">
                     <Info className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                     <p className="text-sm text-blue-800">
                       Insira os preços unitários (sem IVA) indicados pelo novo comercializador. 
                       O comparador adicionará automaticamente o IVA correspondente (6% ou 23%).
                     </p>
                   </div>
                </div>

                <div className="space-y-6">
                  {/* Supplier Name Input */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nome do Fornecedor</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Store className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500" />
                      </div>
                      <input
                        type="text"
                        value={newOffer.supplierName || ''}
                        onChange={(e) => handleOfferChange('supplierName', e.target.value)}
                        className="block w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-lg bg-white text-slate-900"
                        placeholder="Ex: Endesa, Galp, EDP..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Preço da Potência (EUR/dia)</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Zap className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500" />
                      </div>
                      <input
                        type="number"
                        step="0.0001"
                        value={newOffer.powerPricePerDay || ''}
                        onChange={(e) => handleOfferChange('powerPricePerDay', e.target.value)}
                        className="block w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-lg bg-white text-slate-900"
                        placeholder="0.0000"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 text-sm">s/ IVA</span>
                      </div>
                    </div>
                     <p className="text-xs text-slate-400 mt-1 pl-1">Ex: 0.1540 (antes de impostos)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Preço da Energia (EUR/kWh)</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Zap className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500" />
                      </div>
                      <input
                        type="number"
                        step="0.0001"
                        value={newOffer.energyPricePerKwh || ''}
                        onChange={(e) => handleOfferChange('energyPricePerKwh', e.target.value)}
                        className="block w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-lg bg-white text-slate-900"
                        placeholder="0.0000"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 text-sm">s/ IVA</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 pl-1">Ex: 0.1250 (antes de impostos)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- BOTTOM COMPARISON SECTION (Merged) --- */}
        {comparison && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-10 animate-fade-in scroll-mt-20">
             {/* Header */}
             <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center">
                  <Scale className="w-5 h-5 mr-2 text-emerald-400" />
                  <h3 className="font-bold text-white text-lg">
                    Relatório Comparativo Detalhado
                  </h3>
                </div>
                
                {/* Status Tags */}
                <div>
                  {comparison.isCheaper ? (
                     <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/30 whitespace-nowrap">
                       Poupança Detetada
                     </span>
                  ) : (
                     <span className="bg-orange-500/20 text-orange-300 text-xs px-3 py-1 rounded-full border border-orange-500/30 whitespace-nowrap">
                       Mais Dispendioso
                     </span>
                  )}
                </div>
             </div>
             
             {/* 1. High Level Cards */}
             <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 border-b border-slate-200">
                
                {/* Column 1: Without VAT */}
                <div className="p-6 flex flex-col items-center justify-center text-center">
                   <p className="text-sm text-slate-500 font-semibold mb-3 uppercase tracking-wider">Total Sem IVA</p>
                   <div className="flex items-center justify-center space-x-6 w-full">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Atual</p>
                        <p className="text-xl font-bold text-slate-700">{fmt(comparison.currentBase)}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-300" />
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{newOffer.supplierName || 'Nova'}</p>
                        <p className={`text-xl font-bold ${comparison.newBase < comparison.currentBase ? 'text-emerald-600' : 'text-orange-600'}`}>
                          {fmt(comparison.newBase)}
                        </p>
                      </div>
                   </div>
                </div>

                {/* Column 2: With VAT */}
                <div className="p-6 flex flex-col items-center justify-center text-center bg-slate-50/50">
                   <p className="text-sm text-slate-500 font-semibold mb-3 uppercase tracking-wider">Total Com IVA</p>
                   <div className="flex items-center justify-center space-x-6 w-full">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Atual</p>
                        <p className="text-xl font-bold text-slate-700">{fmt(comparison.currentTotal)}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-300" />
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{newOffer.supplierName || 'Nova'}</p>
                        <p className={`text-xl font-bold ${comparison.isCheaper ? 'text-emerald-600' : 'text-orange-600'}`}>
                          {fmt(comparison.newTotal)}
                        </p>
                      </div>
                   </div>
                </div>

                {/* Column 3: Outcome */}
                <div className={`p-6 flex flex-col items-center justify-center text-center ${comparison.isCheaper ? 'bg-emerald-50' : 'bg-orange-50'}`}>
                   {comparison.isCheaper ? (
                     <>
                        <TrendingDown className="w-8 h-8 text-emerald-500 mb-2" />
                        <p className="text-sm font-semibold text-emerald-700 uppercase">Poupança Mensal</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{fmt(comparison.difference)}</p>
                     </>
                   ) : (
                     <>
                        <TrendingUp className="w-8 h-8 text-orange-500 mb-2" />
                        <p className="text-sm font-semibold text-orange-700 uppercase">Custo Adicional</p>
                        <p className="text-2xl font-bold text-orange-700 mt-1">{fmt(Math.abs(comparison.difference))}</p>
                     </>
                   )}
                </div>
             </div>

             {/* 2. Detailed Breakdown Table (Integrated) */}
             <div className="p-6 bg-slate-50/30">
               <div className="flex items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Detalhamento de Custos</h4>
                  <div className="h-px bg-slate-200 flex-grow ml-4"></div>
               </div>
               
               <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                   <table className="w-full text-sm">
                     <thead className="bg-slate-50 border-b border-slate-100">
                       <tr>
                         <th className="px-4 py-3 text-left font-semibold text-slate-500">Item (c/ IVA Incluído)</th>
                         <th className="px-4 py-3 text-right font-semibold text-slate-500">Fatura Atual</th>
                         <th className="px-4 py-3 text-right font-semibold text-slate-500 text-emerald-600">{newOffer.supplierName || 'Nova Proposta'}</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {/* Rows */}
                        <tr>
                            <td className="px-4 py-3 text-slate-700">Energia <span className="text-xs text-slate-400">({billData.monthlyConsumptionKwh} kWh)</span></td>
                            <td className="px-4 py-3 text-right text-slate-600">{fmt(comparison.details.energyCost.current)}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(comparison.details.energyCost.new)}</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 text-slate-700">Potência <span className="text-xs text-slate-400">({billData.billingPeriodDays} dias)</span></td>
                            <td className="px-4 py-3 text-right text-slate-600">{fmt(comparison.details.powerCost.current)}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(comparison.details.powerCost.new)}</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 text-slate-700">Taxas e Impostos</td>
                            <td className="px-4 py-3 text-right text-slate-600">{fmt(comparison.details.taxes.current)}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(comparison.details.taxes.new)}</td>
                        </tr>
                        <tr className="bg-slate-50 font-bold border-t border-slate-200">
                             <td className="px-4 py-4 text-slate-800 text-base">Total a Pagar</td>
                             <td className="px-4 py-4 text-right text-slate-800 text-base">{fmt(comparison.currentTotal)}</td>
                             <td className={`px-4 py-4 text-right text-base ${comparison.isCheaper ? 'text-emerald-600' : 'text-orange-600'}`}>
                               {fmt(comparison.newTotal)}
                             </td>
                        </tr>
                     </tbody>
                   </table>
               </div>
               
               <p className="text-xs text-center text-slate-400 mt-4">
                   Nota: O IVA é calculado automaticamente com base na potência contratada (6% ou 23%) e escalões de consumo quando aplicável.
               </p>
            </div>

            {/* Actions Footer */}
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end items-center gap-4">
               <button
                 onClick={scrollToForm}
                 className="flex items-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                 title="Corrigir ou verificar os dados extraídos da fatura"
               >
                 <Edit3 className="w-4 h-4 mr-2" />
                 Rever Fatura
               </button>
               <button
                 onClick={handleDownloadReport}
                 className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg border border-slate-600"
                 title="Exportar relatório em texto para leitura"
               >
                 <FileText className="w-4 h-4 mr-2" />
                 Exportar Relatório
               </button>

               <button
                 onClick={handleSaveSimulation}
                 className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg"
                 title="Guardar ficheiro para importar futuramente"
               >
                 <Save className="w-4 h-4 mr-2" />
                 Guardar Comparativo
               </button>
            </div>

          </div>
        )}

        {/* --- MULTI COMPARISON SECTION --- */}
        {comparison && (
          <div ref={multiCompRef} className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden mb-10 animate-fade-in">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
              <h3 className="font-bold text-indigo-800 text-lg flex items-center">
                <Trophy className="w-5 h-5 mr-2" />
                Comparador de Cenários Guardados
              </h3>
              
              <div className="relative">
                <input 
                  type="file" 
                  id="multi-sim-upload" 
                  multiple 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleAddMultiSimulations}
                />
                <label 
                  htmlFor="multi-sim-upload" 
                  className="flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Adicionar Comparativos
                </label>
              </div>
            </div>

            <div className="p-6">
              {multiSimulations.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                   <p className="text-slate-500 mb-2">Ainda não adicionou cenários para comparar.</p>
                   <p className="text-xs text-slate-400 max-w-md mx-auto">
                     Carregue múltiplos ficheiros ".json" (gerados pelo botão "Guardar Comparativo") para ver qual é o fornecedor mais barato para o seu consumo atual.
                   </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                     <Info className="w-4 h-4 text-blue-500 mr-2 flex-shrink-0" />
                     <p className="text-xs text-blue-800">
                       A tabela abaixo aplica os tarifários dos cenários importados ao seu <strong>consumo atual</strong> ({billData.monthlyConsumptionKwh} kWh). 
                       Isto garante uma comparação justa entre todos os fornecedores.
                     </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 w-12">Rank</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500">Fornecedor</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-500">Energia</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-500">Potência</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-500">Total Mensal</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-500">Poupança Anual Est.</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-500 w-24">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {multiComparisonResults.map((sim, idx) => (
                          <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-emerald-50/30' : ''}`}>
                            <td className="px-4 py-3">
                              {idx === 0 ? (
                                <Trophy className="w-5 h-5 text-yellow-500" />
                              ) : (
                                <span className="text-slate-400 font-medium ml-1">#{idx + 1}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {sim.newOffer.supplierName || 'Desconhecido'}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              {sim.newOffer.energyPricePerKwh} €
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              {sim.newOffer.powerPricePerDay} €
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">
                              {fmt(sim.calculatedTotal)} €
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${sim.yearlySavings > 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                              {sim.yearlySavings > 0 ? '+' : ''}{fmt(sim.yearlySavings)} €
                            </td>
                            <td className="px-4 py-3">
                               <div className="flex items-center justify-center space-x-2">
                                  <button 
                                    onClick={() => loadSimulationToMain(sim)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Ver Detalhes na Vista Principal"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => removeMultiSimulation(sim.originalIndex)}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Remover"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;