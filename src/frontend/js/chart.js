/**
 * Chart management for Dashboard analytics
 */
class ChartManager {
    constructor() {
        this.chart = null;
        this.currentRange = '7d';
    }

    /**
     * Initialize chart on dashboard
     */
    async init() {
        // Setup range selector event listener
        const rangeSelector = document.getElementById('chartTimeRange');
        if (rangeSelector) {
            rangeSelector.addEventListener('change', (e) => {
                this.currentRange = e.target.value;
                this.loadChartData();
            });
        }

        // Load initial chart data
        await this.loadChartData();
    }

    /**
     * Load chart data from API
     */
    async loadChartData() {
        try {
            const response = await window.api.get(`/events/stats?range=${this.currentRange}`);

            if (response.success && response.data) {
                this.renderChart(response.data);
            } else {
                console.error('Failed to load chart data:', response.error);
                this.showChartError();
            }
        } catch (error) {
            console.error('Chart data loading error:', error);
            this.showChartError();
        }
    }

    /**
     * Render ApexCharts chart
     */
    renderChart(data) {
        const chartElement = document.getElementById('eventsChart');
        if (!chartElement) return;

        // Clear loading state
        chartElement.innerHTML = '';

        // Validate data
        if (!data || !data.events || !Array.isArray(data.events)) {
            console.error('Invalid chart data:', data);
            this.showChartError();
            return;
        }

        // Prepare data for chart
        const labels = data.events.map(item => item.label || '');
        const eventCounts = data.events.map(item => item.count || 0);

        // Merge delivery stats with event data
        const successCounts = [];
        const failedCounts = [];

        if (data.deliveries && Array.isArray(data.deliveries)) {
            labels.forEach(label => {
                const deliveryStat = data.deliveries.find(d => d.label === label);
                successCounts.push(deliveryStat?.success_count || 0);
                failedCounts.push(deliveryStat?.failed_count || 0);
            });
        } else {
            // No delivery data, fill with zeros
            labels.forEach(() => {
                successCounts.push(0);
                failedCounts.push(0);
            });
        }

        // Chart configuration
        const options = {
            series: [
                {
                    name: i18n.t('chart.series.all_events'),
                    data: eventCounts,
                    color: '#667eea'
                },
                {
                    name: i18n.t('chart.series.successful'),
                    data: successCounts,
                    color: '#48bb78'
                },
                {
                    name: i18n.t('chart.series.failed'),
                    data: failedCounts,
                    color: '#f56565'
                }
            ],
            chart: {
                type: 'area',
                height: 350,
                fontFamily: 'Inter, system-ui, sans-serif',
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: false,
                        zoom: false,
                        zoomin: false,
                        zoomout: false,
                        pan: false,
                        reset: false
                    }
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                }
            },
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth',
                width: 3
            },
            xaxis: {
                categories: labels,
                labels: {
                    style: {
                        colors: '#718096',
                        fontSize: '12px'
                    }
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
                }
            },
            yaxis: {
                labels: {
                    style: {
                        colors: '#718096',
                        fontSize: '12px'
                    },
                    formatter: (value) => Math.floor(value)
                }
            },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 4,
                xaxis: {
                    lines: {
                        show: false
                    }
                },
                yaxis: {
                    lines: {
                        show: true
                    }
                }
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.3,
                    stops: [0, 90, 100]
                }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'right',
                fontSize: '14px',
                fontWeight: 500,
                labels: {
                    colors: '#2d3748'
                },
                markers: {
                    width: 12,
                    height: 12,
                    radius: 6
                }
            },
            tooltip: {
                theme: 'light',
                x: {
                    show: true
                },
                y: {
                    formatter: (value) => i18n.t('chart.tooltip_events', { count: value })
                }
            },
            noData: {
                text: i18n.t('chart.no_data'),
                align: 'center',
                verticalAlign: 'middle',
                style: {
                    color: '#718096',
                    fontSize: '16px'
                }
            }
        };

        try {
            // Destroy existing chart if present
            if (this.chart) {
                this.chart.destroy();
            }

            // Create new chart
            this.chart = new ApexCharts(chartElement, options);
            this.chart.render();
        } catch (error) {
            console.error('Chart rendering error:', error);
            this.showChartError();
        }
    }

    /**
     * Show chart error message
     */
    showChartError() {
        const chartElement = document.getElementById('eventsChart');
        if (chartElement) {
            chartElement.innerHTML = `
                <div class="chart-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${i18n.t('chart.load_error')}</p>
                </div>
            `;
        }
    }

    /**
     * Refresh chart data
     */
    async refresh() {
        await this.loadChartData();
    }

    /**
     * Destroy chart instance
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

// Create global chart manager instance
window.chartManager = new ChartManager();
