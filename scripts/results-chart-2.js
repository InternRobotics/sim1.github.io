(() => {
// D3.js Chart with Animated Data Points

// Configuration
const chartConfig = {
    width: 770,
    height: 550,
    margin: { top: 40, right: 40, bottom: 80, left: 80 },
    xDomain: [50, 5000],
    yDomain: [0, 1],
    colors: ['#E0E0E0', '#D4B8D4', '#A890B8'],
    markers: ['circle', 'square', 'triangle']
};

// Data
const datasets = [
    {
        label: 'Real Data',
        color: chartConfig.colors[0],
        marker: chartConfig.markers[0],
        data: [
            { x: 50, y: 0.6 },
            { x: 100, y: 0.43 },
            { x: 200, y: 0.767 },
            { x: 1000, y: 0.67 }
        ]
    },
    {
        label: 'Sim Teleoperated Data',
        color: chartConfig.colors[1],
        marker: chartConfig.markers[1],
        data: [
            { x: 50, y: 0.633 },
            { x: 100, y: 0.67 },
            { x: 200, y: 0.833 }
        ]
    },
    {
        label: 'Sim Generated Data',
        color: chartConfig.colors[2],
        marker: chartConfig.markers[2],
        data: [
            { x: 200, y: 0 },
            { x: 300, y: 0 },
            { x: 500, y: 0.86 },
            { x: 2000, y: 0.904 },
            { x: 3000, y: 0.86 },
            { x: 5000, y: 0.952 }
        ]
    }
];

// Optional extra markers (disabled)
const customScatterPoints = [];

// Log-quadratic scaling function
function logQuadScaling(D, a, b, c) {
    const logD = Math.log10(D);
    return a * logD * logD + b * logD + c;
}


// Fit parameters from Python
const fitParams = {
    'Real Data': { a: -0.2607, b: 1.3468, c: -1.0429, epsilon: 0.11736 },
    'Sim Teleoperated Data': { a: -0.34921, b: 1.7626, c: -1.3973, epsilon: 0.03945 },
    'Sim Generated Data': { a: 0.15745, b: -0.3280, c: 0.1321, epsilon: 0.23333 }
};

// Calculate fitted curve points
function calculateFitCurve(dataset) {
    const params = fitParams[dataset.label];
    const xValues = dataset.data.map(d => d.x);
    // For Gen, extend the fit curve left until the axis cutoff.
    const axisMinX = chartConfig.xDomain[0];
    const axisMaxX = chartConfig.xDomain[1];
    const xMin = (dataset.label === 'Sim Generated Data')
        ? axisMinX
        : Math.max(axisMinX, Math.min(...xValues));
    const xMax = Math.min(axisMaxX, Math.max(...xValues));

    const fitCurve = [];
    for (let i = 0; i <= 200; i++) {
        const x = xMin + (xMax - xMin) * 1.1 * (i / 200);
        const y = logQuadScaling(x, params.a, params.b, params.c);
        if (y >= 0 && y <= 1) {
            fitCurve.push({ x, y });
        }
    }
    return fitCurve;
}

// Calculate error band
function calculateErrorBand(dataset, fitCurve) {
    const params = fitParams[dataset.label];
    const epsilon = params.epsilon;

    return {
        upper: fitCurve.map(p => ({ x: p.x, y: Math.min(1, p.y + epsilon) })),
        lower: fitCurve.map(p => ({ x: p.x, y: Math.max(0, p.y - epsilon) }))
    };
}

// Calculate vertex (maximum point) of a quadratic curve
function calculateVertex(dataset) {
    const params = fitParams[dataset.label];
    if (params.a >= 0) return null; // Parabola opens upward, no vertex

    const logX_opt = -params.b / (2 * params.a);
    const x_opt = Math.pow(10, logX_opt);
    const y_opt = logQuadScaling(x_opt, params.a, params.b, params.c);
    
    return { x: x_opt, y: y_opt };
}

// Find x value on curve that matches a given y value (for Gen dataset)
function findXForY(dataset, targetY) {
    const params = fitParams[dataset.label];
    const curve = calculateFitCurve(dataset);
    
    // Binary search to find x where y ≈ targetY
    let left = curve[0].x;
    let right = curve[curve.length - 1].x;
    let tolerance = 0.01;
    
    for (let i = 0; i < 50; i++) {
        const mid = (left + right) / 2;
        const midY = logQuadScaling(mid, params.a, params.b, params.c);
        
        if (Math.abs(midY - targetY) < tolerance) {
            return mid;
        }
        
        if (midY < targetY) {
            left = mid;
        } else {
            right = mid;
        }
    }
    
    return (left + right) / 2;
}

// Create the chart
function createChart() {
    // Prevent stacking replays if createChart() is called multiple times
    if (typeof window !== 'undefined') {
        if (window.__resultsChart2ReplayTimeoutId) {
            clearTimeout(window.__resultsChart2ReplayTimeoutId);
            window.__resultsChart2ReplayTimeoutId = null;
        }
    }

    const container = d3.select('#chart-container-2');
    container.html('');

    d3.select('#results-chart-2-tooltip').remove();
    const tipOffX = 12;
    const tipOffY = 14;

    const tooltip = d3.select('body')
        .append('div')
        .attr('id', 'results-chart-2-tooltip')
        .attr('class', 'chart-tooltip')
        .style('opacity', 0);

    const theme = getComputedStyle(document.body);
    const markerStroke = theme.getPropertyValue('--chart-marker-stroke').trim() || 'rgba(0, 0, 0, 0.3)';
    const annotationColor = theme.getPropertyValue('--chart-annotation-color').trim() || 'rgba(255, 255, 255, 0.9)';
    const annotationColorSoft = theme.getPropertyValue('--chart-annotation-color-soft').trim() || 'rgba(255, 255, 255, 0.85)';

    function setTooltipPos(ev) {
        const cx = typeof ev.clientX === 'number' ? ev.clientX : ev.pageX - window.scrollX;
        const cy = typeof ev.clientY === 'number' ? ev.clientY : ev.pageY - window.scrollY;
        tooltip
            .style('left', '0')
            .style('top', '0')
            .style('transform', `translate(${cx + tipOffX}px, ${cy + tipOffY}px)`);
    }

    const width = chartConfig.width - chartConfig.margin.left - chartConfig.margin.right;
    const height = chartConfig.height - chartConfig.margin.top - chartConfig.margin.bottom;

    const svg = container.append('svg')
        .attr('width', chartConfig.width)
        .attr('height', chartConfig.height)
        .attr('viewBox', `0 0 ${chartConfig.width} ${chartConfig.height}`)
        .attr('class', 'results-chart');

    const g = svg.append('g')
        .attr('transform', `translate(${chartConfig.margin.left},${chartConfig.margin.top})`);

    // Scales
    const xScale = d3.scaleLog()
        .domain(chartConfig.xDomain)
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain(chartConfig.yDomain)
        .range([height, 0]);

    // Axes
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.format('.0e'))
        .ticks(10)
        .tickValues([100, 1000, 5000]);

    const yAxis = d3.axisLeft(yScale)
        .tickFormat(d3.format('.1f'))
        .ticks(6);

    // Grid lines
    g.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .tickSize(-height)
            .tickFormat('')
            .ticks(20));

    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(yScale)
            .tickSize(-width)
            .tickFormat('')
            .ticks(10));

    // X axis
    g.append('g')
        .attr('class', 'x axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('font-size', '12px');

    // Y axis
    g.append('g')
        .attr('class', 'y axis')
        .call(yAxis)
        .selectAll('text')
        .style('font-size', '12px');

    // Axis labels
    svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', chartConfig.width / 2)
        .attr('y', chartConfig.height - 10)
        .attr('text-anchor', 'middle')
        .text('Num of Training Demos');

    svg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -chartConfig.height / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .text('Success Rate');

    // Line generator
    const line = d3.line()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .curve(d3.curveMonotoneX);

    // Area generator for error bands (y0/y1 will be provided per-point)
    const errorBandArea = d3.area()
        // keep fit curve on log scale; error band can extend to x=0 (left edge)
        // by supplying points with explicit pixel x via `_px`.
        .x(d => (typeof d._px === 'number' ? d._px : xScale(d.x)))
        .y0(d => yScale(d.y0))
        .y1(d => yScale(d.y1))
        .curve(d3.curveMonotoneX);

    // Draw datasets with animation
    datasets.forEach((dataset, datasetIndex) => {
        const fitCurve = calculateFitCurve(dataset);
        const errorBand = calculateErrorBand(dataset, fitCurve);

        // Error band
        // Smoothly "grow" the band from x=0 to the first curve x (no hard flat segment).
        const firstX = fitCurve[0]?.x ?? dataset.data[0]?.x ?? chartConfig.xDomain[0];
        const firstPx = xScale(firstX);
        const firstY0 = errorBand.lower[0].y;
        const firstY1 = errorBand.upper[0].y;
        const firstCenter = (firstY0 + firstY1) / 2;
        const firstWidth = Math.max(0, firstY1 - firstY0);

        let bandData;
        if (firstPx <= 1e-6) {
            // Fit curve already starts at the left edge (pixel x=0)
            bandData = fitCurve.map((p, i) => ({
                x: p.x,
                y0: errorBand.lower[i].y,
                y1: errorBand.upper[i].y
            }));
        } else {
            // Build a ramp from pixel x=0 to pixel x=firstPx,
            // computing y0/y1 based on the same log-quadratic model + fixed epsilon.
            // This avoids "hard/forced" geometry and fills the left-bottom region smoothly.
            const params = fitParams[dataset.label];
            const epsilon = params.epsilon;

            const logMin = Math.log10(chartConfig.xDomain[0]);
            const logMax = Math.log10(chartConfig.xDomain[1]);

            const rampSteps = 24;
            const ramp = Array.from({ length: rampSteps + 1 }, (_, k) => {
                const t = k / rampSteps; // 0..1
                const px = firstPx * t; // 0..firstPx

                // Invert log scale: D(px) for log model evaluation.
                // Since xScale range is [0, width], px/width corresponds to linear interpolation in log space.
                const logD = logMin + (px / width) * (logMax - logMin);
                const D = Math.pow(10, logD);

                const centerY = logQuadScaling(D, params.a, params.b, params.c);
                const y0 = Math.max(0, centerY - epsilon);
                const y1 = Math.min(1, centerY + epsilon);

                return { _px: px, y0, y1 };
            });

            // Skip fitCurve[0] to avoid duplicate join at x=firstX (pixel x=firstPx)
            bandData = [
                ...ramp,
                ...fitCurve.slice(1).map((p, i) => {
                    const idx = i + 1; // original fitCurve index
                    return {
                        x: p.x,
                        y0: errorBand.lower[idx].y,
                        y1: errorBand.upper[idx].y
                    };
                })
            ];
        }

        g.append('path')
            .datum(bandData)
            .attr('class', 'error-band')
            .attr('d', errorBandArea)
            .attr('fill', dataset.color)
            // opacity is controlled via CSS (.results-chart .error-band)
            .attr('opacity', 1);

        // Data points first - draw them before the curve
        dataset.data.forEach((d, i) => {
            const markerGroup = g.append('g')
                .attr('class', 'data-point-marker')
                .attr('transform', `translate(${xScale(d.x)},${yScale(d.y)})`)
                .attr('opacity', 0)
                .style('cursor', 'pointer');

            // Draw marker based on type
            const markerSize = 8;
            if (dataset.marker === 'circle') {
                markerGroup.append('circle')
                    .attr('r', markerSize)
                    .attr('fill', dataset.color)
                    .attr('stroke', markerStroke)
                    .attr('stroke-width', 2);
            } else if (dataset.marker === 'square') {
                markerGroup.append('rect')
                    .attr('x', -markerSize)
                    .attr('y', -markerSize)
                    .attr('width', markerSize * 2)
                    .attr('height', markerSize * 2)
                    .attr('fill', dataset.color)
                    .attr('stroke', markerStroke)
                    .attr('stroke-width', 2);
            } else if (dataset.marker === 'triangle') {
                markerGroup.append('polygon')
                    .attr('points', `0,-${markerSize * 1.2} -${markerSize},${markerSize * 0.8} ${markerSize},${markerSize * 0.8}`)
                    .attr('fill', dataset.color)
                    .attr('stroke', markerStroke)
                    .attr('stroke-width', 2);
            }

            // Animate data point appearance with scale animation - points animate first
            markerGroup
                .attr('opacity', 0)
                .attr('transform', `translate(${xScale(d.x)},${yScale(d.y)}) scale(0)`)
                .transition()
                .duration(500)
                .delay(datasetIndex * 500 + i * 200)
                .attr('opacity', 1)
                .attr('transform', `translate(${xScale(d.x)},${yScale(d.y)}) scale(1)`);

            // Add hover events for tooltip
            markerGroup.on('mouseover', function(event) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('transform', `translate(${xScale(d.x)},${yScale(d.y)}) scale(1.3)`)
                    .style('filter', 'drop-shadow(0 0 5px rgba(0,0,0,0.3))');

                tooltip.transition()
                    .duration(200)
                    .style('opacity', 0.95);

                tooltip.html(`
                    <div class="tooltip-content">
                        <div class="tooltip-header">${dataset.label}</div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Num of Training Demos:</span>
                            <span class="tooltip-value">${d.x}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Success Rate:</span>
                            <span class="tooltip-value">${d.y.toFixed(4)}</span>
                        </div>
                    </div>
                `);
                setTooltipPos(event);
            })
            .on('mousemove', function(event) {
                setTooltipPos(event);
            })
            .on('mouseout', function() {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('transform', `translate(${xScale(d.x)},${yScale(d.y)}) scale(1)`)
                    .style('filter', 'none');

                tooltip.transition()
                    .duration(200)
                    .style('opacity', 0);
            });
        });

        // Fit curve - animate after all points are shown
        const pointAnimationDelay = dataset.data.length * 200 + 500; // Time for all points to finish
        g.append('path')
            .datum(fitCurve)
            .attr('class', 'fit-line')
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', dataset.color)
            .attr('stroke-width', 4)
            .attr('opacity', 0)
            .transition()
            .duration(1000)
            .delay(datasetIndex * 500 + pointAnimationDelay)
            .attr('opacity', 1);
    });

    // Custom scatter points with horizontal line
    customScatterPoints.forEach((point, i) => {
        const lineLengthRatio = 0.15;
        const lineLengthX = point.x * lineLengthRatio;
        const xStart = point.x - lineLengthX / 2;
        const xEnd = point.x + lineLengthX / 2;

        // Horizontal line
        g.append('line')
            .attr('x1', xScale(xStart))
            .attr('y1', yScale(point.y))
            .attr('x2', xScale(xEnd))
            .attr('y2', yScale(point.y))
            .attr('stroke', point.color)
            .attr('stroke-width', 3)
            .attr('opacity', 0)
            .transition()
            .duration(500)
            .delay(datasets.length * 500 + i * 300)
            .attr('opacity', 0.9);

        // Hexagon marker
        const markerGroup = g.append('g')
            .attr('transform', `translate(${xScale(point.x)},${yScale(point.y)}) scale(0)`)
            .attr('opacity', 0);

        const hexSize = 9;
        const hexPoints = [];
        for (let j = 0; j < 6; j++) {
            const angle = (Math.PI / 3) * j - Math.PI / 6;
            hexPoints.push(`${hexSize * Math.cos(angle)},${hexSize * Math.sin(angle)}`);
        }

        markerGroup.append('polygon')
            .attr('points', hexPoints.join(' '))
            .attr('fill', point.color)
            .attr('stroke', markerStroke)
            .attr('stroke-width', 2)
            .attr('opacity', 0.9);

        markerGroup.transition()
            .duration(500)
            .delay(datasets.length * 500 + i * 300 + 200)
            .attr('opacity', 1)
            .attr('transform', `translate(${xScale(point.x)},${yScale(point.y)}) scale(1)`);
    });

    // Legend (positioned below Gen curve, between 1e+3 and 1e+4)
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${xScale(3000)}, ${yScale(0.15)})`);

    datasets.forEach((dataset, i) => {
        const legendGroup = legend.append('g')
            .attr('transform', `translate(0, ${i * 30})`)
            .attr('opacity', 0);

        const legendMarker = legendGroup.append('g')
            .attr('transform', 'translate(10, 0)');

        if (dataset.marker === 'circle') {
            legendMarker.append('circle')
                .attr('r', 6)
                .attr('fill', dataset.color)
                .attr('stroke', markerStroke)
                .attr('stroke-width', 2);
        } else if (dataset.marker === 'square') {
            legendMarker.append('rect')
                .attr('x', -6)
                .attr('y', -6)
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', dataset.color)
                .attr('stroke', markerStroke)
                .attr('stroke-width', 2);
        } else if (dataset.marker === 'triangle') {
            legendMarker.append('polygon')
                .attr('points', `0,-9 -9,6 9,6`)
                .attr('fill', dataset.color)
                .attr('stroke', markerStroke)
                .attr('stroke-width', 2);
        }

        legendGroup.append('text')
            .attr('x', 25)
            .attr('y', 5)
            .text(dataset.label)
            .style('font-size', '14px')
            .style('fill', annotationColor);

        legendGroup.transition()
            .duration(500)
            .delay(i * 200)
            .attr('opacity', 1);
    });

    // Draw auxiliary lines for Chart 2: verticals at x=300 and x=1500, range to 5000
    const realDataset = datasets.find(
        d => d.label === 'Real' || d.label === 'Real Data'
    );
    if (realDataset) {
        const xLeft = 300;
        const xRight = 1500;
        const params = fitParams[realDataset.label];
        const refY = Math.max(0, Math.min(1, logQuadScaling(xLeft, params.a, params.b, params.c)));

        const lastCurveStart = (datasets.length - 1) * 500 + (datasets[datasets.length - 1].data.length * 200 + 500);
        const allCurvesFinish = lastCurveStart + 1000;
        const auxiliaryDelay = allCurvesFinish + 500;

        // Left vertical at x=300
        g.append('line')
            .attr('class', 'auxiliary-line vertical-start')
            .attr('x1', xScale(xLeft))
            .attr('y1', yScale(refY))
            .attr('x2', xScale(xLeft))
            .attr('y2', yScale(0))
            .attr('stroke', annotationColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('opacity', 0)
            .transition()
            .duration(800)
            .delay(auxiliaryDelay)
            .attr('opacity', 0.7);

        // Horizontal line from x=300 to x=1500 at y=refY
        g.append('line')
            .attr('class', 'auxiliary-line horizontal')
            .attr('x1', xScale(xLeft))
            .attr('y1', yScale(refY))
            .attr('x2', xScale(xRight))
            .attr('y2', yScale(refY))
            .attr('stroke', annotationColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('opacity', 0)
            .transition()
            .duration(800)
            .delay(auxiliaryDelay)
            .attr('opacity', 0.7);

        // Right vertical at x=1500
        g.append('line')
            .attr('class', 'auxiliary-line vertical-end')
            .attr('x1', xScale(xRight))
            .attr('y1', yScale(refY))
            .attr('x2', xScale(xRight))
            .attr('y2', yScale(0))
            .attr('stroke', annotationColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('opacity', 0)
            .transition()
            .duration(800)
            .delay(auxiliaryDelay)
            .attr('opacity', 0.7);

        // Labels
        g.append('text')
            .attr('class', 'auxiliary-label')
            .attr('x', xScale(xLeft))
            .attr('y', yScale(refY) - 15)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', annotationColor)
            .style('font-weight', '500')
            .text(String(xLeft))
            .attr('opacity', 0)
            .transition()
            .duration(500)
            .delay(auxiliaryDelay + 1000)
            .attr('opacity', 1);

        g.append('text')
            .attr('class', 'auxiliary-label')
            .attr('x', xScale(xRight) + 10)
            .attr('y', yScale(refY))
            .attr('text-anchor', 'start')
            .style('font-size', '14px')
            .style('fill', annotationColor)
            .style('font-weight', '500')
            .text(String(xRight))
            .attr('opacity', 0)
            .transition()
            .duration(500)
            .delay(auxiliaryDelay + 1000)
            .attr('opacity', 1);

        // Bottom labels on x-axis for auxiliary vertical lines
        g.append('text')
            .attr('class', 'auxiliary-label')
            .attr('x', xScale(xLeft))
            .attr('y', yScale(0) + 18)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', annotationColorSoft)
            .text(String(xLeft))
            .attr('opacity', 0)
            .transition()
            .duration(500)
            .delay(auxiliaryDelay + 1000)
            .attr('opacity', 1);

        g.append('text')
            .attr('class', 'auxiliary-label')
            .attr('x', xScale(xRight))
            .attr('y', yScale(0) + 18)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', annotationColorSoft)
            .text(String(xRight))
            .attr('opacity', 0)
            .transition()
            .duration(500)
            .delay(auxiliaryDelay + 1000)
            .attr('opacity', 1);
    }

    // Replay: wait 3 seconds after all animations finish, then restart
    // We compute the maximum end time of the transitions we schedule above.
    const lastDataset = datasets[datasets.length - 1];
    const lastCurveStart = (datasets.length - 1) * 500 + (lastDataset.data.length * 200 + 500);
    const allCurvesFinish = lastCurveStart + 1000; // fit curve duration

    // Custom scatter points (if provided globally)
    const customPoints = (typeof customScatterPoints !== 'undefined' && Array.isArray(customScatterPoints))
        ? customScatterPoints
        : [];
    const customScatterFinish = customPoints.length
        ? (datasets.length * 500 + (customPoints.length - 1) * 300 + 700) // marker ends at delay+500 (delay includes +200)
        : 0;

    // Auxiliary lines + labels end time (only if the condition to draw them is met)
    let auxiliaryFinish = 0;
    if (realDataset) {
        const auxiliaryDelay = allCurvesFinish + 500;
        auxiliaryFinish = auxiliaryDelay + 1000 + 500; // label delay + duration
    }

    const animationFinishMs = Math.max(allCurvesFinish, customScatterFinish, auxiliaryFinish);
    const replayDelayMs = 3000;
    if (typeof window !== 'undefined') {
        window.__resultsChart2ReplayTimeoutId = setTimeout(() => {
            // ensure we stop any in-flight transitions before recreating
            try { d3.select('#chart-container-2').selectAll('*').interrupt(); } catch (_) {}
            createChart();
        }, animationFinishMs + replayDelayMs);
    }
}

// Initialize on DOM ready and D3.js is loaded
let d3Ready = false;
let chartCreated = false;

function loadD3AndInitChart() {
    const d3Script = document.createElement('script');
    d3Script.src = 'https://d3js.org/d3.v7.min.js';
    d3Script.onload = function() {
        d3Ready = true;
        console.log('D3.js loaded');
        createChart();
        chartCreated = true;
    };
    d3Script.onerror = function() {
        console.error('Failed to load D3.js');
    };
    document.head.appendChild(d3Script);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    loadD3AndInitChart();
});

window.addEventListener('sim1-themechange', function() {
    if (d3Ready) createChart();
});

})();