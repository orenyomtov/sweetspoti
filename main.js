async function getAllPages(request) {
    const paginatedResponse = await request;

    let currentResponse = paginatedResponse;

    while (currentResponse.next) {
        currentResponse = await spotifyApi.getGeneric(currentResponse.next);
        paginatedResponse.items = paginatedResponse.items.concat(currentResponse.items);
    }

    return paginatedResponse;
}

async function fetchSpotifyGuestAccessToken() {
    return (await (await fetch("https://spotify-guest-token.herokuapp.com/get_access_token")).json()).accessToken
}

async function getFollowedUsers(spotifyApi) {
    const guestAccessToken = await fetchSpotifyGuestAccessToken()
    const me = await spotifyApi.getMe()

    return (await(await fetch(`https://spclient.wg.spotify.com/user-profile-view/v3/profile/${me.id}/following`, {
        "headers": {
            "accept": "application/json",
            "accept-language": "en",
            "app-platform": "WebPlayer",
            "authorization": `Bearer ${guestAccessToken}`,
            "spotify-app-version": "1.1.54.282.g5e733e7e"
        },
        "referrer": "https://open.spotify.com/",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors"
    })).json()).profiles.filter(x => x.uri.startsWith('spotify:user'))
}

function processLoginRedirect() {
    const fragmentString = window.location.hash.slice(1);
    const fragmentParams = new URLSearchParams(fragmentString);

    if (fragmentParams.get("access_token")) {
        window.localStorage.setItem('spotifyUserAccessToken', fragmentParams.get("access_token"))
        window.localStorage.setItem('spotifyUserAccessTokenExpiry', Date.now() + parseInt(fragmentParams.get("expires_in")) * 1000)
    }

    // Clear url fragment (#)
    history.replaceState(null, null, ' ');
}

function redirectToLogin() {
    // window.location.href = 'https://accounts.spotify.com/authorize?client_id=8bf1d78c0a4e44aaa611730d9caf856c&response_type=token&redirect_uri=https%3A%2F%2Fwww.sweetspoti.com%2F&scope=user-follow-read'
    window.location.href = "https://accounts.spotify.com/authorize?client_id=8bf1d78c0a4e44aaa611730d9caf856c&response_type=token&redirect_uri=http%3A%2F%2Flocalhost%3A8000%2F&scope=user-follow-read";
}

function isLoggedIn() {
    return window.localStorage.getItem('spotifyUserAccessToken') && parseInt(window.localStorage.getItem('spotifyUserAccessTokenExpiry')) > Date.now()
}

async function main() {
    processLoginRedirect()

    if (!isLoggedIn()) {
        return redirectToLogin()
    }

    const spotifyApi = new SpotifyWebApi()
    spotifyApi.setAccessToken(window.localStorage.getItem('spotifyUserAccessToken'))

    spotifyUserFollowedUsers = await getFollowedUsers(spotifyApi)

    console.log(spotifyUserFollowedUsers)
}

main()