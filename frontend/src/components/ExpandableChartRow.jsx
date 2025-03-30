import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export default function ExpandableChartRow({ symbol }) {
  const [data, setData] = useState([]);
  const [lastTimestamp, setLastTimestamp] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`http://localhost:3028/api/timepoints/${symbol}?interval=1m`);
      const json = await res.json();
      setData(json || []);
      const last = json.length ? json[json.length - 1].t : null;
      setLastTimestamp(last);
    } catch (err) {
      console.error('❌ Failed to fetch graph data:', err.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3028/api/timepoints/${symbol}?interval=1m&after=${lastTimestamp}`);
        const json = await res.json();
        if (json.length > 0) {
          setData(prev => [...prev, ...json]);
          const last = json[json.length - 1].t;
          setLastTimestamp(last);
        }
      } catch (err) {
        console.error('❌ Live update failed:', err.message);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [symbol, lastTimestamp]);

  const formatTime = (ts) => {
    const date = new Date(ts);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const values = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
    return (
      <div className="bg-black text-white text-sm p-2 rounded border border-gray-700">
        <div><strong>🕒 {formatTime(label)}</strong></div>
        {values.p != null && <div>Available to Borrow: {values.p.toFixed(2)}</div>}
        {values.fb != null && <div>Binance Funding: {(values.fb * 100).toFixed(4)}%</div>}
        {values.fby != null && <div>Bybit Funding: {(values.fby * 100).toFixed(4)}%</div>}
        {values.fg != null && <div>Gate.io Funding: {values.fg.toFixed(4)}%</div>}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 p-4 rounded">
      <h2 className="text-lg font-bold mb-2 text-white">{symbol} - Borrow + Funding History</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
          <XAxis dataKey="t" tickFormatter={formatTime} minTickGap={30} />
          <YAxis yAxisId="left" stroke="#00FFFF" />
          <YAxis yAxisId="right" orientation="right" stroke="#FFD700" />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="p" stroke="#00FF99" name="Available to Borrow" dot={false} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="fb" stroke="#33B5FF" name="Binance Funding" dot={false} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="fby" stroke="#FFB347" name="Bybit Funding" dot={false} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="fg" stroke="#FF6B6B" name="Gate.io Funding" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
