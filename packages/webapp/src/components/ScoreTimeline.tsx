import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import React, { useEffect, useRef } from 'react';

import type { TimelinePoint } from '../types';

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export function ScoreTimeline({ timeline }: { timeline: TimelinePoint[] }): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || timeline.length === 0) {
      return;
    }

    const chart = echarts.init(containerRef.current, 'dark');

    const scoreData = timeline.map((p) => [p.iteration, p.bestScore]);

    chart.setOption({
      backgroundColor: 'transparent',
      textStyle: { color: '#cbd5e1' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#2dd4bf',
        borderWidth: 1,
        textStyle: { color: '#f1f5f9' },
        formatter: (params: unknown) => {
          const p = Array.isArray(params) ? params[0] : params;
          const data = (p as { data: number[] }).data;
          return `Iteration: ${data[0]?.toLocaleString()}<br/>Best Score: <b style="color:#2dd4bf">${data[1]}</b>`;
        },
      },
      grid: {
        top: 20,
        right: 20,
        bottom: 60,
        left: 60,
      },
      xAxis: {
        type: 'value',
        name: 'Iteration',
        nameLocation: 'center',
        nameGap: 35,
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', formatter: (v: number) => v.toLocaleString() },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      yAxis: {
        type: 'value',
        name: 'Score',
        nameTextStyle: { color: '#94a3b8' },
        inverse: false,
        min: 0,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 10,
          height: 20,
          borderColor: '#334155',
          fillerColor: 'rgba(45, 212, 191, 0.15)',
          handleStyle: { color: '#2dd4bf' },
          moveHandleStyle: { color: '#2dd4bf' },
          textStyle: { color: '#94a3b8' },
          dataBackground: {
            lineStyle: { color: '#475569' },
            areaStyle: { color: 'rgba(71, 85, 105, 0.3)' },
          },
        },
      ],
      series: [
        {
          type: 'line',
          data: scoreData,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#2dd4bf', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(45, 212, 191, 0.35)' },
              { offset: 1, color: 'rgba(45, 212, 191, 0.02)' },
            ]),
          },
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [timeline]);

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Score Timeline</h3>
      <div ref={containerRef} className="w-full h-64" />
    </div>
  );
}
