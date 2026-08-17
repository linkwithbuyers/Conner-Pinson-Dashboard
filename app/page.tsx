  const refresh = async () => {
    const { sheetId, sheetGid } = sourceConfig;
    if (!sheetId || !sheetGid) {
      setError("The dashboard Sheet connection is not configured yet.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const endpoint = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("The Sheet could not be read right now.");
      const nextRecords = normalizeRows(parseCsv(await response.text()));
      if (!nextRecords.length) throw new Error("The Sheet returned no usable activity records.");
      const knownIds = readLocal<string[]>(SEEN_KEY, []);
      const actions = nextRecords.filter((record) => record.priority <= 3);
      const firstLoad = knownIds.length === 0;
      setNewIds(firstLoad ? [] : actions.filter((record) => !knownIds.includes(record.id)).map((record) => record.id));
      saveLocal(SEEN_KEY, Array.from(new Set([...knownIds, ...actions.map((record) => record.id)])));
      const now = new Date().toISOString();
      setRecords(nextRecords);
      setRefreshedAt(now);
      saveLocal(CACHE_KEY, { records: nextRecords, refreshedAt: now });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Sheet could not be read right now.");
    } finally {
      setLoading(false);
    }
  };
  const searchedRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return records;
    return records.filter((record) =>
      [record.fullName, record.title, record.company, record.location, record.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, records]);
  const activeRecords = searchedRecords.filter((record) => !archivedKeys.includes(archiveKey(record)));
  const archivedRecords = searchedRecords.filter((record) => archivedKeys.includes(archiveKey(record)));
  const actionRecords = activeRecords.filter((record) => record.priority <= 3);
  const actions = actionRecords.sort((left, right) => {
    const leftWatchTime = left.hasWatched ? Date.parse(left.watchedAt) || 0 : 0;
    const rightWatchTime = right.hasWatched ? Date.parse(right.watchedAt) || 0 : 0;
    const leftSentTime = Date.parse(left.videoSent) || 0;
    const rightSentTime = Date.parse(right.videoSent) || 0;
    return rightWatchTime - leftWatchTime || rightSentTime - leftSentTime || left.priority - right.priority || Date.parse(right.timestamp) - Date.parse(left.timestamp);
  });
  const pinned = activeRecords.filter((record) => pinnedKeys.includes(archiveKey(record)));
  const unpinnedActions = actions.filter((record) => !pinnedKeys.includes(archiveKey(record)));
  const archived = [...archivedRecords].sort((left, right) => {
    const leftWatchTime = left.hasWatched ? Date.parse(left.watchedAt) || 0 : 0;
    const rightWatchTime = right.hasWatched ? Date.parse(right.watchedAt) || 0 : 0;
    const leftSentTime = Date.parse(left.videoSent) || 0;
    const rightSentTime = Date.parse(right.videoSent) || 0;
    return rightWatchTime - leftWatchTime || rightSentTime - leftSentTime || Date.parse(right.timestamp) - Date.parse(left.timestamp);
  });
  const latestVideoDate = latestVideoSent(records);
  const isFirstLoad = !refreshedAt && !records.length;
  void newIds;
  return (
    <main className="dashboard-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="brand-mark"><img src="./link-with-buyers-rabbit.png" alt="Link With Buyers rabbit logo" /></div>
          <div><p className="eyebrow">Link With Buyers</p><h1>Campaign Activity</h1></div>
        </div>
        <div className="refresh-block">
          <button className="refresh-button" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing\u2026" : records.length ? "Refresh Dashboard" : "Load Dashboard"}
          </button>
          <p>{latestVideoDate ? `Latest Refresh: ${formatDateOnly(latestVideoDate)}` : "Latest Refresh will appear after loading the Sheet."}</p>
        </div>
      </header>
      {error ? <div className="notice error-notice">{error} {records.length ? "Your last saved view is still shown below." : ""}</div> : null}
      {isFirstLoad ? (
        <section className="empty-state">
          <p className="eyebrow">Ready when you are</p>
          <h2>Load the current campaign activity.</h2>
          <p>The first refresh shows the full backlog of people who need attention. Later refreshes identify newly watched videos and new replies.</p>
        </section>
      ) : (
        <>
          <section className="section-heading action-heading action-controls-only">
            <div className="controls">
              <label className="search-field"><span className="sr-only">Search activity</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or companies" /></label>
            </div>
          </section>
          {pinned.length ? (
            <section className="active-section" aria-live="polite">
              <div className="subsection-heading"><h3>Pinned Cards</h3><p>Prospects you have pinned for closer attention.</p></div>
              <div className="lead-grid active-grid">{pinned.map((record) => <LeadCard key={record.id} record={record} pinned archived={archivedKeys.includes(archiveKey(record))} noteOverride={notesOverrides[archiveKey(record)]} onSaveNote={saveNote} onViewConversation={setSelectedRecord} onArchive={toggleArchive} onPin={togglePin} />)}</div>
            </section>
          ) : null}
          <section className="all-cards-section" aria-live="polite">
            <div className="subsection-heading"><h3>Prospects</h3><p>Most recent video watch first, then most recent video sent.</p></div>
            <div className="lead-grid">{unpinnedActions.length ? unpinnedActions.map((record) => <LeadCard key={record.id} record={record} pinned={pinnedKeys.includes(archiveKey(record))} archived={archivedKeys.includes(archiveKey(record))} noteOverride={notesOverrides[archiveKey(record)]} onSaveNote={saveNote} onViewConversation={setSelectedRecord} onArchive={toggleArchive} onPin={togglePin} />) : <p className="queue-empty">No prospects match this view.</p>}</div>
          </section>
          <section className="all-cards-section archive-section" aria-live="polite">
            <div className="subsection-heading"><h3>Archive</h3><p>Most recent video watch first.</p></div>
            <div className="lead-grid">{archived.length ? archived.map((record) => <LeadCard key={record.id} record={record} pinned={pinnedKeys.includes(archiveKey(record))} archived noteOverride={notesOverrides[archiveKey(record)]} onSaveNote={saveNote} onViewConversation={setSelectedRecord} onArchive={toggleArchive} onPin={togglePin} />) : <p className="queue-empty">No archived prospects.</p>}</div>
          </section>
        </>
      )}
      {selectedRecord ? (
        <div className="conversation-overlay" role="presentation" onMouseDown={() => setSelectedRecord(null)}>
          <section className="conversation-panel" role="dialog" aria-modal="true" aria-labelledby="conversation-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Initial Conversation</p>
                <h2 id="conversation-title">{selectedRecord.fullName}</h2>
                <p>{[selectedRecord.title, selectedRecord.company, selectedRecord.location].filter(Boolean).join(" \u00b7 ") || "Profile details unavailable"}</p>
              </div>
              <button className="close-button" onClick={() => setSelectedRecord(null)} aria-label="Close conversation">Close</button>
            </div>
            <ConversationText record={selectedRecord} />
            <div className="panel-footer">
              <span>{formatActivityTime(selectedRecord.timestamp)}</span>
              <div className="card-actions">
                {selectedRecord.profileUrl ? <a className="linkedin-link" href={selectedRecord.profileUrl} target="_blank" rel="noreferrer">Open LinkedIn</a> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
