import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  LineChart,
  Line
} from 'recharts';

export const MainChart = ({ data, type = 'area', dataKey, color }: { data: any[], type?: 'area' | 'line', dataKey: string, color: string }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      {type === 'area' ? (
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
          <XAxis 
            dataKey="timestamp" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
            hide
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#15171A', border: '1px solid #22262B', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace' }}
            itemStyle={{ color: color }}
          />
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            fillOpacity={1} 
            fill={`url(#gradient-${dataKey})`} 
            strokeWidth={2}
          />
        </AreaChart>
      ) : (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
          <XAxis 
            dataKey="timestamp" 
            hide
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
          />
          <Tooltip 
             contentStyle={{ backgroundColor: '#15171A', border: '1px solid #22262B', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace' }}
          />
          <Line 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
};
