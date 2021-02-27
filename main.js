async function getAllPages(request) {
  const paginatedResponse = await request;

  let currentResponse = paginatedResponse;

  while (currentResponse.next) {
    currentResponse = await spotifyApi.getGeneric(currentResponse.next);
    paginatedResponse.items = paginatedResponse.items.concat(
      currentResponse.items
    );
  }

  return paginatedResponse;
}

async function fetchSpotifyGuestAccessToken() {
  return (
    await (
      await fetch("https://spotify-guest-token.herokuapp.com/get_access_token")
    ).json()
  ).accessToken;
}

async function getFollowedUsers(spotifyApi) {
  const guestAccessToken = await fetchSpotifyGuestAccessToken();
  const me = await spotifyApi.getMe();

  return (
    await (
      await fetch(
        `https://spclient.wg.spotify.com/user-profile-view/v3/profile/${me.id}/following`,
        {
          headers: {
            accept: "application/json",
            "accept-language": "en",
            "app-platform": "WebPlayer",
            authorization: `Bearer ${guestAccessToken}`,
            "spotify-app-version": "1.1.54.282.g5e733e7e",
          },
          referrer: "https://open.spotify.com/",
          referrerPolicy: "strict-origin-when-cross-origin",
          body: null,
          method: "GET",
          mode: "cors",
        }
      )
    ).json()
  ).profiles.filter((x) => x.uri.startsWith("spotify:user"));
}

async function getFullPlaylists(followed) {
  const userIds = getUserIds(followed);
  const playlists = await Promise.all(userIds.map(getAllUserPlaylists));
  const augmentedPlaylists = await Promise.all(
    playlists.map(augmentPlaylistWithTracks)
  );
  return augmentedPlaylists;
}

function getUserIds(followed) {
  return followed.map((user) => user.uri.split(":")[2]);
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

function processLoginRedirect() {
  const fragmentString = window.location.hash.slice(1);
  const fragmentParams = new URLSearchParams(fragmentString);

  if (fragmentParams.get("access_token")) {
    window.localStorage.setItem(
      "spotifyUserAccessToken",
      fragmentParams.get("access_token")
    );
    window.localStorage.setItem(
      "spotifyUserAccessTokenExpiry",
      Date.now() + parseInt(fragmentParams.get("expires_in")) * 1000
    );
  }

  // Clear url fragment (#)
  history.replaceState(null, null, " ");
}

function redirectToLogin() {
  const redirectUrl = encodeURIComponent(window.location.href);
  window.location.href = `https://accounts.spotify.com/authorize?client_id=8bf1d78c0a4e44aaa611730d9caf856c&response_type=token&redirect_uri=${redirectUrl}&scope=user-follow-read`;
}

function isLoggedIn() {
  return (
    window.localStorage.getItem("spotifyUserAccessToken") &&
    parseInt(window.localStorage.getItem("spotifyUserAccessTokenExpiry")) >
      Date.now()
  );
}

async function main() {
  processLoginRedirect();

  if (!isLoggedIn()) {
    return redirectToLogin();
  }

  const spotifyApi = new SpotifyWebApi();
  spotifyApi.setAccessToken(
    window.localStorage.getItem("spotifyUserAccessToken")
  );

  const spotifyUserFollowedUsers = await getFollowedUsers(spotifyApi);
  const spotifyFollowedPlaylists = await getFullPlaylists(
    spotifyUserFollowedUsers
  );
}

main();
