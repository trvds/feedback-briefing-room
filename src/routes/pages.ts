export async function handlePageRequest(
  request: Request,
  pathname: string
): Promise<Response> {
  // Serve CSS
  if (pathname === "/styles.css") {
    const css = await import("../templates/styles.css?raw").catch(() => null);
    if (css) {
      return new Response(css.default || css, {
        headers: { "Content-Type": "text/css" },
      });
    }
    // Fallback: read from file system (for development)
    return new Response("", {
      headers: { "Content-Type": "text/css" },
    });
  }

  // Serve newsroom page
  if (pathname === "/" || pathname === "/newsroom.html") {
    const html = await getNewsroomHTML();
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Serve court page
  if (pathname === "/court.html") {
    const html = await getCourtHTML();
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Page not found", { status: 404 });
}

async function getNewsroomHTML(): Promise<string> {
  // In production, this would read from a file or template
  // For now, return the HTML inline
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Feedback Journal - Daily Edition</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <div class="newsroom-header">
      <h1>🗞️ The Feedback Journal</h1>
      <div class="newsroom-date"><span id="date"></span></div>
    </div>

    <div id="loading" class="loading">Loading today's briefing...</div>
    <div id="error" class="error" style="display: none;"></div>

    <div id="content" style="display: none;">
      <div class="top-story" id="top-story">
        <h2>🔥 Top Story</h2>
        <p class="section-intro">Today's most pressing matter requiring immediate editorial attention.</p>
        <div class="top-story-content" id="top-story-content">
          Loading...
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">⚡ Breaking Issues</h2>
        <p class="section-intro">Urgent dispatches reporting production incidents, system failures, and blocking issues.</p>
        <div id="breaking-issues"></div>
      </div>

      <div class="section">
        <h2 class="section-title">🛩️ Flying under the radar</h2>
        <p class="section-intro">High-severity reports that might escape notice due to low volume but warrant investigation.</p>
        <div id="under-radar"></div>
      </div>

      <div class="section">
        <h2 class="section-title">👨‍💻 Developer Experience</h2>
        <p class="section-intro">Dispatches from the front lines: documentation gaps, error messages, and workflow friction.</p>
        <div id="developer-experience"></div>
      </div>

      <div class="section">
        <h2 class="section-title">💰 Pricing & Limits</h2>
        <p class="section-intro">Matters of economics: billing concerns, quotas, rate limits, and cost transparency.</p>
        <div id="pricing-limits"></div>
      </div>

      <div class="section">
        <h2 class="section-title">✅ Things That Look Bad But Aren't</h2>
        <p class="section-intro">False alarms that appeared alarming but prove to be display quirks or user misunderstandings.</p>
        <div id="false-alarms"></div>
      </div>
    </div>
  </div>

  <script>
    let currentEditionDate = null;

    function setEditionDateLabel(editionDate) {
      document.getElementById('date').textContent = editionDate
        ? new Date(editionDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function renderEdition(edition) {
      const t = edition.topStory || {};
      document.getElementById('top-story-content').innerHTML = \`
        <h3>\${t.headline || 'No top story'}</h3>
        <p>\${t.body || ''}</p>
        \${t.feedbackId ? \`<button class="open-case-btn" onclick="openCase(\${t.feedbackId})">⚖️ Open the Case</button>\` : ''}
      \`;
      const section = (arr, key) => {
        const el = document.getElementById(key);
        if (!arr || arr.length === 0) { el.innerHTML = '<p style="color: #999; font-style: italic;">No items in this section.</p>'; return; }
        el.innerHTML = arr.map(item => \`
          <div class="story-item">
            <h3>\${item.title || item.excerpt || ''}</h3>
            <p>\${item.excerpt || ''}</p>
            \${item.feedbackId ? \`<button class="open-case-btn" onclick="openCase(\${item.feedbackId})">⚖️ Open the Case</button>\` : ''}
          </div>
        \`).join('');
      };
      section(edition.breakingIssues, 'breaking-issues');
      const underRadarEl = document.getElementById('under-radar');
      if (edition.underRadar && edition.underRadar.length > 0) {
        underRadarEl.innerHTML = edition.underRadar.map(item => \`
          <div class="under-radar-alert">
            <strong>⚠️ Flying under the radar:</strong>
            <p>"\${item.excerpt || ''}"</p>
            <p><strong>Severity:</strong> \${item.severity != null ? item.severity + '/10' : '—'}</p>
            <p><strong>Reason:</strong> \${item.reason || ''}</p>
            \${item.feedbackId ? \`<button class="open-case-btn" onclick="openCase(\${item.feedbackId})">⚖️ Open the Case</button>\` : ''}
          </div>
        \`).join('');
      } else {
        underRadarEl.innerHTML = '<p style="color: #999; font-style: italic;">No items flying under the radar today.</p>';
      }
      section(edition.developerExperience, 'developer-experience');
      section(edition.pricingLimits, 'pricing-limits');
      section(edition.falseAlarms, 'false-alarms');
    }

    async function loadBriefing() {
      try {
        const editionRes = await fetch('/api/edition/latest');
        const editionData = await editionRes.json();
        if (editionData.content && editionData.content.topStory) {
          currentEditionDate = editionData.edition_date || null;
          setEditionDateLabel(currentEditionDate);
          renderEdition(editionData.content);
          document.getElementById('loading').style.display = 'none';
          document.getElementById('content').style.display = 'block';
          return;
        }

        const feedbackRes = await fetch('/api/feedback?limit=100');
        const feedbackData = await feedbackRes.json();
        const feedback = feedbackData.feedback || [];

        const underRadarRes = await fetch('/api/under-radar');
        const underRadarData = await underRadarRes.json();
        const underRadar = underRadarData.underRadar || [];

        setEditionDateLabel(null);

        const breakingIssues = feedback.filter(f => {
          const c = f.content.toLowerCase();
          return c.includes('urgent') || c.includes('critical') || c.includes('down') || 
                 c.includes('broken') || c.includes('blocked') || c.includes('incident');
        }).slice(0, 3);

        const devExFeedback = feedback.filter(f => {
          const c = f.content.toLowerCase();
          return c.includes('developer') || c.includes('docs') || c.includes('documentation') ||
                 c.includes('experience') || c.includes('error message') || c.includes('debug');
        }).slice(0, 3);

        const pricingFeedback = feedback.filter(f => {
          const c = f.content.toLowerCase();
          return c.includes('pricing') || c.includes('price') || c.includes('bill') ||
                 c.includes('cost') || c.includes('limit') || c.includes('quota');
        }).slice(0, 3);

        const falseAlarms = feedback.filter(f => {
          const c = f.content.toLowerCase();
          return c.includes('look bad') || c.includes('display bug') ||
                 c.includes('not actually') || c.includes('false alarm');
        }).slice(0, 2);

        const topStoryItem = breakingIssues[0] || underRadar[0]?.feedback || feedback[0];
        if (topStoryItem) {
          document.getElementById('top-story-content').innerHTML = \`
            <h3>\${topStoryItem.content.substring(0, 100)}\${topStoryItem.content.length > 100 ? '...' : ''}</h3>
            <p>\${topStoryItem.content}</p>
            <div class="story-meta">Source: \${topStoryItem.source} • \${new Date(topStoryItem.timestamp).toLocaleString()}</div>
            <button class="open-case-btn" onclick="openCase(\${topStoryItem.id})">⚖️ Open the Case</button>
          \`;
        }

        renderSection('breaking-issues', breakingIssues);
        renderUnderRadar('under-radar', underRadar);
        renderSection('developer-experience', devExFeedback);
        renderSection('pricing-limits', pricingFeedback);
        renderSection('false-alarms', falseAlarms);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
      } catch (error) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Error loading briefing: ' + error.message;
      }
    }

    function renderSection(containerId, items) {
      const container = document.getElementById(containerId);
      if (items.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No items in this section.</p>';
        return;
      }
      container.innerHTML = items.map(item => \`
        <div class="story-item">
          <h3>\${item.content.substring(0, 80)}\${item.content.length > 80 ? '...' : ''}</h3>
          <p>\${item.content}</p>
          <div class="story-meta">Source: \${item.source} • \${new Date(item.timestamp).toLocaleString()}</div>
          <button class="open-case-btn" onclick="openCase(\${item.id})">⚖️ Open the Case</button>
        </div>
      \`).join('');
    }

    function renderUnderRadar(containerId, underRadar) {
      const container = document.getElementById(containerId);
      if (underRadar.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No items flying under the radar today.</p>';
        return;
      }
      container.innerHTML = underRadar.slice(0, 5).map(flag => \`
        <div class="under-radar-alert">
          <strong>⚠️ Flying under the radar:</strong>
          <p>"\${flag.feedback.content.substring(0, 100)}\${flag.feedback.content.length > 100 ? '...' : ''}"</p>
          <p><strong>Severity:</strong> \${flag.severity_score.toFixed(1)}/10</p>
          <p><strong>Reason:</strong> \${flag.reason}</p>
          <div class="story-meta">Source: \${flag.feedback.source} • \${new Date(flag.feedback.timestamp).toLocaleString()}</div>
          <button class="open-case-btn" onclick="openCase(\${flag.feedback.id})">⚖️ Open the Case</button>
        </div>
      \`).join('');
    }

    function openCase(feedbackId) {
      fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: \`Case for Feedback #\${feedbackId}\`, feedbackIds: [feedbackId], includeSimilar: true, similarLimit: 10 })
      }).then(res => res.json())
        .then(data => { if (data.id) window.location.href = \`/court.html?case=\${data.id}\`; })
        .catch(err => alert('Error creating case: ' + err.message));
    }

    loadBriefing();
  </script>
</body>
</html>`;
}

async function getCourtHTML(): Promise<string> {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback Court - Case Review</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <div class="court-header">
      <h1>⚖️ Feedback Court</h1>
    </div>

    <a href="/newsroom.html" class="back-link">← Back to Newsroom</a>

    <div id="loading" class="loading">Loading case...</div>
    <div id="error" class="error" style="display: none;"></div>

    <div id="content" style="display: none;">
      <div class="case-title" id="case-title">Case Title</div>

      <div class="court-layout">
        <div class="court-panel prosecution-panel">
          <h2>🔴 Prosecution</h2>
          <div id="prosecution-content"></div>
        </div>

        <div class="court-panel defense-panel">
          <h2>🔵 Defense</h2>
          <div id="defense-content"></div>
        </div>

        <div class="court-panel verdict-panel">
          <h2>⚖️ Judge's Verdict (AI)</h2>
          <div class="verdict-content" id="verdict-content"></div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">📋 Related Feedback</h2>
        <div id="related-feedback"></div>
      </div>
    </div>
  </div>

  <script>
    async function loadCase() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const caseId = urlParams.get('case');
        if (!caseId) throw new Error('No case ID provided');

        const res = await fetch(\`/api/cases/\${caseId}\`);
        if (!res.ok) throw new Error('Case not found');

        const data = await res.json();
        const { case: caseData, feedback, prosecution, defense, verdict } = data;

        document.getElementById('case-title').textContent = \`Case: \${caseData.title}\`;

        document.getElementById('prosecution-content').innerHTML = \`
          <p><strong>Summary:</strong></p>
          <p>\${prosecution}</p>
          <p><strong>Evidence:</strong></p>
          <ul class="feedback-list">
            \${feedback.filter(f => {
              const c = f.content.toLowerCase();
              return c.includes('urgent') || c.includes('critical') || c.includes('down') ||
                     c.includes('broken') || c.includes('blocked') || c.includes('error');
            }).map(f => \`
              <li>
                <strong>\${f.source}</strong>
                <p>\${f.content}</p>
                <div class="story-meta">\${new Date(f.timestamp).toLocaleString()}</div>
              </li>
            \`).join('')}
          </ul>
        \`;

        document.getElementById('defense-content').innerHTML = \`
          <p>\${defense}</p>
          <p><strong>Counterpoints:</strong></p>
          <ul>
            <li>Total feedback volume: \${feedback.length} items</li>
            <li>Most feedback from: \${feedback.length > 0 ? feedback[0].source : 'unknown'}</li>
            <li>Consider: This might be expected behavior or user error</li>
            <li>Documentation may already address this concern</li>
          </ul>
        \`;

        const urgencyClass = \`urgency-\${verdict.urgency || 'medium'}\`;
        document.getElementById('verdict-content').innerHTML = \`
          <div class="urgency-badge \${urgencyClass}">\${verdict.urgency || 'Medium'} Urgency</div>
          <p><strong>Verdict:</strong></p>
          <p>\${verdict.verdict}</p>
          <p><strong>Suggested Action:</strong></p>
          <p>\${verdict.suggestedAction}</p>
        \`;

        document.getElementById('related-feedback').innerHTML = feedback.map(f => \`
          <div class="story-item">
            <h3>\${f.source}</h3>
            <p>\${f.content}</p>
            <div class="story-meta">\${new Date(f.timestamp).toLocaleString()}</div>
          </div>
        \`).join('');

        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
      } catch (error) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Error loading case: ' + error.message;
      }
    }
    loadCase();
  </script>
</body>
</html>`;
}
