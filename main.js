let playlistsData = [];
let progressBarPercent = 0;
let playlistsCount = 0;
let promiseThrottle = new PromiseThrottle({
  requestsPerSecond: 9,
  promiseImplementation: Promise,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeAgo(time) {
  let units = [
    { name: "second", limit: 60, in_seconds: 1 },
    { name: "minute", limit: 3600, in_seconds: 60 },
    { name: "hour", limit: 86400, in_seconds: 3600 },
    { name: "day", limit: 604800, in_seconds: 86400 },
    { name: "week", limit: 2629743, in_seconds: 604800 },
    { name: "month", limit: 31556926, in_seconds: 2629743 },
    { name: "year", limit: null, in_seconds: 31556926 },
  ];
  let diff = (new Date() - new Date(time * 1000)) / 1000;
  if (diff < 5) return "now";

  let i = 0;
  while ((unit = units[i++])) {
    if (diff < unit.limit || !unit.limit) {
      let diff = Math.floor(diff / unit.in_seconds);
      return diff + " " + unit.name + (diff > 1 ? "s" : "");
    }
  }
}

async function getAllPages(request) {
  const paginatedResponse = await request;

  let currentResponse = paginatedResponse;

  while (currentResponse.next) {
    currentResponse = await promiseThrottle.add(function () {
      return spotifyApi.getGeneric(currentResponse.next);
    });
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
  const allPlaylists = usersPlaylists.flat().filter((x) => x.tracks.total > 3);

  playlistsCount = allPlaylists.length;
  updateProgressBar(20, "Loading followers...");

  let augmentedPlaylists = await Promise.all(
    allPlaylists.map(augmentPlaylistWithFollowers)
  );

  playlistsData = augmentedPlaylists;
  renderPopular();

  updateProgressBar(60, "Wondering why Spotify's API is so slow...");
  await sleep(1000);

  updateProgressBar(60, "Loading activity data...");

  augmentedPlaylists = await Promise.all(
    augmentedPlaylists.map(augmentPlaylistWithTracks)
  );
  return augmentedPlaylists;
}

function getUserIds(followed) {
  return followed.map((user) => user.uri.split(":")[2]);
}

async function getAllUserPlaylists(userId) {
  const playlistsResponse = await getAllPages(
    promiseThrottle.add(function () {
      return spotifyApi.getUserPlaylists(userId, { limit: 50 });
    })
  );
  const playlists = playlistsResponse.items;
  const onlyUserPlaylists = playlists.filter((p) => p.owner.id === userId);
  return onlyUserPlaylists;
}

async function augmentPlaylistWithFollowers(playlistObj) {
  const { followers } = await promiseThrottle.add(function () {
    return spotifyApi.getPlaylist(playlistObj.id);
  });
  incrementProgressBar();

  return { ...playlistObj, followers: followers.total };
}

async function augmentPlaylistWithTracks(playlistObj) {
  const tracks = await getAllPlaylistTracks(playlistObj.id);
  const dates = getDates(tracks);
  incrementProgressBar();
  return { ...playlistObj, ...dates };
}

async function getAllPlaylistTracks(playlistId) {
  const tracksResponse = await getAllPages(
    promiseThrottle.add(function () {
      return spotifyApi.getPlaylistTracks(playlistId);
    })
  );
  return tracksResponse.items;
}

function getDates(tracks) {
  const dates = tracks.map((t) => new Date(t.added_at).getTime());
  const last_updated = Math.max(...dates);
  const created_at = Math.min(...dates);
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
  let fetchedPlaylistsData = window.localStorage.getItem(key);
  if (!fetchedPlaylistsData) {
    const spotifyUserFollowedUsers = (await getFollowedUsers(spotifyApi)).slice(2,5);
    updateProgressBar(10, "Loading playlists...");
    fetchedPlaylistsData = await getFullPlaylists(spotifyUserFollowedUsers);
    window.localStorage.setItem(key, JSON.stringify(fetchedPlaylistsData));
  } else {
    fetchedPlaylistsData = JSON.parse(fetchedPlaylistsData);
  }
  hideProgressBar();
  return fetchedPlaylistsData;
}

function getPlaylistHTML(playlist) {
  const image = playlist.images[playlist.images.length - 1];
  imageUrl = image ? image.url : "/default.png";

  return `<div role="row" aria-rowindex="1" aria-selected="false">
    <div
      data-testid="tracklist-row"
      class="e8ea6a219247d88aa936a012f6227b0d-scss bddcb131e9b40fa874148a30368d83f8-scss"
      draggable="true"
      onclick="location='${playlist.uri}'"
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
              href="${playlist.owner.uri}"
              onclick="stopEventPropagation(event)"
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
          ${playlist.followers} followers
        </div>
      </div>
    </div>
  </div>`;
}

function stopEventPropagation(event) {
    event.stopPropagation()
  }

function updateProgressBar(percent, text) {
  progressBarPercent = percent;

  if (text) {
    document.getElementById("progressText").textContent = text;
  }
  document.getElementById("progressBar").style.width = `${percent}%`;
}

function incrementProgressBar() {
  updateProgressBar(progressBarPercent + 40 / playlistsCount);
}

function hideProgressBar() {
  document.getElementById("progressBarContainer").style.display = "none";
}

function renderUI(playlists) {
  console.log(playlists);
  const playlistContainer = document.getElementById("playlistsContainer");
  playlistsHtml = playlists.map(getPlaylistHTML).join("");
  playlistContainer.innerHTML = playlistsHtml;
}

function selectButton(button) {
  if (!button) {
    return;
  }

  Array.from(button.parentElement.children).map((x) =>
    x.firstElementChild.classList.remove(
      "a4bc298d40e9660cd25cd3ac1a7f9c49-scss"
    )
  );

  button.firstElementChild.classList.add(
    "a4bc298d40e9660cd25cd3ac1a7f9c49-scss"
  );
}
function renderPopular(button) {
  selectButton(button);

  renderUI(
    playlistsData
      .filter((x) => x.followers > 0)
      .sort((b, a) => a.followers - b.followers)
  );
}

function renderRecent(button) {
  selectButton(button);

  renderUI(
    playlistsData
      .filter((x) => x.followers > 0)
      .sort((b, a) => a.last_updated - b.last_updated)
  );
}

function renderNew(button) {
  selectButton(button);

  renderUI(
    playlistsData
      .filter((x) => x.followers > 0)
      .sort((b, a) => a.created_at - b.created_at)
  );
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

  playlistsData = await fetchPlaylists();
  console.log(playlistsData);
  renderPopular();
}

main();
