const container = document.getElementById('root');

if (!container) {
  throw new Error('SmartHire mount target #root was not found');
}

if (!window.React || !window.ReactDOM) {
  throw new Error('SmartHire dependencies failed to load');
}

const root = ReactDOM.createRoot(container);
root.render(React.createElement(App));
