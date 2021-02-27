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
  const usersPlaylists = await Promise.all(userIds.map(getAllUserPlaylists));
  const allPlaylists = usersPlaylists.flat();
  return allPlaylists;
  const augmentedPlaylists = await Promise.all(
    allPlaylists.map(augmentPlaylistWithTracks)
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
  return { ...playlistObj, ...dates };
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

async function fetchPlaylists() {
  const key = "playlistsData";
  let playlistsData = window.localStorage.getItem(key);
  if (!playlistsData) {
    const spotifyUserFollowedUsers = await getFollowedUsers(spotifyApi);
    playlistsData = await getFullPlaylists(spotifyUserFollowedUsers);
    window.localStorage.setItem(key, JSON.stringify(playlistsData));
  } else {
    playlistsData = JSON.parse(playlistsData);
  }
  return playlistsData;
}

function getPlaylistHTML(playlist) {
  const image = playlist.images[playlist.images.length - 1];
  imageUrl = image
    ? image.url
    : "/default.png";
  return `<div role="row" aria-rowindex="1" aria-selected="false">
    <div
      data-testid="tracklist-row"
      class="e8ea6a219247d88aa936a012f6227b0d-scss bddcb131e9b40fa874148a30368d83f8-scss"
      draggable="true"
    >
      <div
        class="_5845794624a406a62eb5b71d3d1c4d63-scss"
        role="gridcell"
        aria-colindex="1"
        tabindex="-1"
      >
        <div class="_9811afda86f707ead7da1d12f4dd2d3e-scss">
          <img
            aria-hidden="false"
            draggable="false"
            loading="eager"
            src="${imageUrl}"
            alt=""
            class="_64acb0e26fe0d9dff68a0e9725b2a920-scss fc0bebbbc5e1404f464fb4d8c17001dc-scss"
            width="40"
            height="40"
          />
        </div>
        <div class="_8ea0b892e971e6b90a252247c160b4f4-scss">
          <div
            class="da0bc4060bb1bdb4abb8e402916af32e-scss standalone-ellipsis-one-line _8a9c5cc886805907de5073b8ebc3acd8-scss"
            dir="auto"
            as="div"
          >
            ${playlist.name}
          </div>
          <span
            class="_966e29b71d2654743538480947a479b3-scss standalone-ellipsis-one-line f3fc214b257ae2f1d43d4c594a94497f-scss"
            as="span"
            ><a
              draggable="true"
              dir="auto"
              href="/artist/1ThoqLcyIYvZn7iWbj8fsj"
              tabindex="-1"
              >By ${playlist.owner.display_name}</a
            ></span
          >
        </div>
      </div>
      <div
        class="b9f411c6b990949776c8edf3daeb26ad-scss"
        role="gridcell"
        aria-colindex="2"
        tabindex="-1"
      >
        <div class="ec1b5762556429ac3aeedbae72433491-scss">
          2 followers
        </div>
      </div>
    </div>
  </div>`;
}

function renderUI(playlists) {
  const playlistContainer = document.getElementById("playlistsContainer");
  playlistsHtml = playlists.map(getPlaylistHTML).join("");
  playlistContainer.innerHTML = playlistsHtml;
}

async function main() {
  processLoginRedirect();

  if (!isLoggedIn()) {
    return redirectToLogin();
  }

  window.spotifyApi = new SpotifyWebApi();
  spotifyApi.setAccessToken(
    window.localStorage.getItem("spotifyUserAccessToken")
  );

  const playlistsData = await fetchPlaylists();
  console.log(playlistsData);
  renderUI(playlistsData);
}

main();
