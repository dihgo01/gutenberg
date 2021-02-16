/** @typedef {import('@octokit/rest').Octokit} GitHub */
/** @typedef {import('@octokit/types').Endpoints} Endpoints */
/** @typedef {Endpoints["GET /repos/{owner}/{repo}/issues"]["response"]} listIssuesResponse  */
/** @typedef {Endpoints["GET /repos/{owner}/{repo}/milestones"]["response"]} listMilestonesResponse  */

/**
 * @template T
 * @typedef {import('@octokit/types').GetResponseDataTypeFromEndpointMethod<T>} GetResponseDataTypeFromEndpointMethod
 */

/**
 * @typedef {"open"|"closed"|"all"} IssueState
 */

/**
 * Returns a promise resolving to a milestone by a given title, if exists.
 *
 * @param {GitHub} octokit Initialized Octokit REST client.
 * @param {string} owner   Repository owner.
 * @param {string} repo    Repository name.
 * @param {string} title   Milestone title.
 *
 * @return {Promise<listMilestonesResponse["data"]|undefined>} Promise resolving to milestone, if exists.
 */
async function getMilestoneByTitle( octokit, owner, repo, title ) {
	const options = octokit.issues.listMilestones.endpoint.merge( {
		owner,
		repo,
	} );

	const responses = octokit.paginate.iterator( options );

	for await ( const response of responses ) {
		const milestones = response.data;
		for ( const milestone of milestones ) {
			if ( milestone.title === title ) {
				return milestone;
			}
		}
	}
	return undefined;
}

/**
 * Returns a promise resolving to pull requests by a given milestone ID.
 *
 * @param {GitHub}     octokit   Initialized Octokit REST client.
 * @param {string}     owner     Repository owner.
 * @param {string}     repo      Repository name.
 * @param {number}     milestone Milestone ID.
 * @param {IssueState} [state]   Optional issue state.
 *
 * @return {Promise<listIssuesResponse["data"]>} Promise resolving to pull
 *                                                    requests for the given
 *                                                    milestone.
 */
async function getIssuesByMilestone( octokit, owner, repo, milestone, state ) {
	const milestoneResponse = await octokit.issues.getMilestone( {
		owner,
		repo,
		milestone_number: milestone,
	} );
	const series = milestoneResponse.data.title.replace( 'Gutenberg ', '' );

	const releaseOptions = await octokit.repos.listReleases.endpoint.merge( {
		owner,
		repo,
	} );

	let latestReleaseInSeries;

	const releases = octokit.paginate.iterator( releaseOptions );

	for await ( const releasesPage of releases ) {
		latestReleaseInSeries = releasesPage.data.find( ( release ) =>
			release.name.startsWith( series )
		);

		if ( latestReleaseInSeries ) {
			break;
		}
	}

	const options = octokit.issues.listForRepo.endpoint.merge( {
		owner,
		repo,
		milestone,
		state,
		...( latestReleaseInSeries && {
			since: latestReleaseInSeries.published_at,
		} ),
	} );

	const responses = octokit.paginate.iterator( options );

	/**
	 * @type {GetResponseDataTypeFromEndpointMethod<typeof octokit.issues.listForRepo>}
	 */
	const pulls = [];

	for await ( const response of responses ) {
		const issues = response.data;
		pulls.push( ...issues );
	}

	if ( latestReleaseInSeries?.published_at ) {
		const latestReleasePublishedAtTimestamp = new Date(
			latestReleaseInSeries.published_at
		);

		return pulls.filter(
			( pull ) =>
				pull.closed_at &&
				latestReleasePublishedAtTimestamp < new Date( pull.closed_at )
		);
	}

	return pulls;
}

module.exports = {
	getMilestoneByTitle,
	getIssuesByMilestone,
};
