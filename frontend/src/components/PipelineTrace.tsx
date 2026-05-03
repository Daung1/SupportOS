import React, { useState } from 'react';

interface DocTrace {
  id?: string;
  title: string;
  score: number;
  passedFilter: boolean;
  filterReason: string;
}

interface PipelineTraceData {
  scenario: string;
  classification: { type: string; confidence: number; reason: string };
  relevanceThreshold: number;
  allDocuments: DocTrace[];
  usedDocuments: DocTrace[];
  generationPath: string;
  llmError?: string;
}

interface PipelineTraceProps {
  trace?: PipelineTraceData;
  ticketInput?: string;
}

const GENERATION_PATH_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  llm_success:           { label: '✅ LLM Success',           color: 'text-green-700 bg-green-50 border-green-200',  desc: 'The AI model produced a valid response.' },
  llm_returned_empty:    { label: '⚠️ LLM Returned Empty',    color: 'text-yellow-700 bg-yellow-50 border-yellow-200', desc: 'The AI model responded but with empty content. Fell back to deterministic output.' },
  llm_failed:            { label: '❌ LLM Failed',            color: 'text-red-700 bg-red-50 border-red-200',        desc: 'The AI model threw an error. Fell back to deterministic output.' },
  no_documents:          { label: '📭 No Documents',          color: 'text-gray-700 bg-gray-50 border-gray-200',     desc: 'No documents passed the relevance filter. A generic holding message was returned.' },
  fallback_no_snippets:  { label: '📭 Fallback (no snippets)', color: 'text-gray-700 bg-gray-50 border-gray-200',   desc: 'Documents were found but had no usable content. A generic message was returned.' },
  fallback_with_snippets:{ label: '🔧 Fallback (snippets)',   color: 'text-orange-700 bg-orange-50 border-orange-200', desc: 'LLM unavailable; document snippets were stitched together deterministically.' },
};

function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  const pct = Math.min(100, Math.round(score * 100));
  const passed = score >= threshold;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold min-w-[3rem] text-right ${passed ? 'text-green-700' : 'text-red-600'}`}>
        {(score * 100).toFixed(1)}%
      </span>
    </div>
  );
}

export const PipelineTrace: React.FC<PipelineTraceProps> = ({ trace, ticketInput }) => {
  const [showAll, setShowAll] = useState(false);

  if (!trace) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Pipeline Trace</h3>
        <p className="text-sm text-gray-500">
          No pipeline trace available for this ticket. Trace data is recorded for tickets
          processed after this feature was enabled. Submit a new ticket to see the full trace.
        </p>
      </div>
    );
  }

  const pathInfo = GENERATION_PATH_LABELS[trace.generationPath] ?? {
    label: trace.generationPath,
    color: 'text-gray-700 bg-gray-50 border-gray-200',
    desc: '',
  };

  const filteredOut = trace.allDocuments.filter((d) => !d.passedFilter);
  const displayDocs = showAll ? trace.allDocuments : trace.allDocuments.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* ── Step 1: Classification ── */}
      <div className="bg-white rounded-lg shadow-md p-5">
        <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
          Classification
        </h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Scenario</p>
            <p className="font-semibold text-blue-800">{trace.scenario}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Type</p>
            <p className="font-semibold text-blue-800">{trace.classification.type}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Confidence</p>
            <p className="font-semibold text-blue-800">{(trace.classification.confidence * 100).toFixed(1)}%</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-2 italic">"{trace.classification.reason}"</p>
      </div>

      {/* ── Step 2: Document Search & Filtering ── */}
      <div className="bg-white rounded-lg shadow-md p-5">
        <h3 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
          Document Search &amp; Relevance Filter
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Relevance threshold: <span className="font-mono font-semibold text-gray-700">{(trace.relevanceThreshold * 100).toFixed(0)}%</span>
          {' — '}documents scoring below this are excluded to prevent off-topic answers.
        </p>

        <div className="flex gap-3 text-xs mb-3">
          <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">
            Total retrieved: <b>{trace.allDocuments.length}</b>
          </span>
          <span className="px-2 py-1 bg-green-100 rounded text-green-700">
            Passed filter: <b>{trace.usedDocuments.length}</b>
          </span>
          <span className="px-2 py-1 bg-red-100 rounded text-red-700">
            Excluded: <b>{filteredOut.length}</b>
          </span>
        </div>

        {trace.allDocuments.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No documents were retrieved by the Searcher.</p>
        ) : (
          <div className="space-y-2">
            {displayDocs.map((doc, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 ${doc.passedFilter ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-sm font-medium ${doc.passedFilter ? 'text-green-800' : 'text-red-700'}`}>
                    {doc.passedFilter ? '✅' : '❌'} {doc.title}
                  </span>
                </div>
                <ScoreBar score={doc.score} threshold={trace.relevanceThreshold} />
                <p className="text-xs text-gray-500 mt-1">{doc.filterReason}</p>
              </div>
            ))}
            {trace.allDocuments.length > 8 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-blue-600 hover:underline"
              >
                {showAll ? 'Show less' : `Show ${trace.allDocuments.length - 8} more…`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Step 3: Response Generation ── */}
      <div className="bg-white rounded-lg shadow-md p-5">
        <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
          Response Generation
        </h3>

        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium mb-2 ${pathInfo.color}`}>
          {pathInfo.label}
        </div>
        <p className="text-xs text-gray-600 mb-3">{pathInfo.desc}</p>

        {trace.llmError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
            <p className="text-xs font-semibold text-red-700 mb-1">LLM Error Detail</p>
            <p className="text-xs text-red-600 font-mono break-words">{trace.llmError}</p>
          </div>
        )}

        {trace.usedDocuments.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Documents used as context:</p>
            <ul className="space-y-1">
              {trace.usedDocuments.map((doc, i) => (
                <li key={i} className="text-xs text-gray-700 flex items-center gap-2">
                  <span className="text-green-600">•</span>
                  {doc.title}
                  <span className="text-gray-400 font-mono">({(doc.score * 100).toFixed(1)}%)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(trace.generationPath === 'fallback_with_snippets' || trace.generationPath === 'fallback_no_snippets') && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs text-orange-700">
              <b>Why did fallback trigger?</b> The LLM either failed or returned empty content.
              The system fell back to a deterministic template. To fix this, ensure the AI model
              service is reachable and the documents are relevant to the customer's question.
            </p>
          </div>
        )}
      </div>

      {/* ── User Question (for quick reference) ── */}
      {ticketInput && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer Question</p>
          <p className="text-sm text-gray-700 italic">"{ticketInput}"</p>
        </div>
      )}
    </div>
  );
};
