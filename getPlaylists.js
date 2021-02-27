async function getFullPlaylists(followed) {
  const playlists = await Promise.all(followed.map(getAllUserPlaylists));
  const augmentedPlaylists = await Promise.all(
    playlists.map(augmentPlaylistWithTracks)
  );
  return augmentedPlaylists;
}

async function getAllUserPlaylists(userId) {
  const reqPromise = spotifyApi.getUserPlaylists(userId, { limit: 50 });
  const playlistsResponse = await getAllPages(reqPromise);
  return playlistsResponse.items;
}

async function augmentPlaylistWithTracks(playlistObj) {
  const tracks = await getAllPlaylistTracks(playlistObj.id);
  const dates = getDates(tracks);
  return { ...playlistObj, ...dates, tracks };
}

async function getAllPlaylistTracks(playlistId) {
  const reqPromise = spotifyApi.getPlaylistTracks(playlistId);
  const tracksResponse = await getAllPages(reqPromise);
  return tracksResponse.items;
}

function getDates(tracks) {
  const dates = tracks.map((t) => new Date(t.added_at));
  const last_updated = new Date(Math.max(...dates));
  const created_at = new Date(Math.min(...dates));
  return { last_updated, created_at };
}
